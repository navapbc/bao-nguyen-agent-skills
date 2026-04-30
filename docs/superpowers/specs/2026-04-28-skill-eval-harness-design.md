# Skill Evaluation Harness — Design

**Date:** 2026-04-28
**Status:** Draft, pending implementation plan
**Author:** Bao Nguyen
**Subsystem:** 1 of 3 (Skill Eval Harness → Managed Agent → Non-Technical Builder UX)

## Goal

Build a GitHub Actions + AWS pipeline that evaluates each agent skill in this repo for **output quality** and **cost/latency** whenever a pull request modifies it. Results post back to the PR as a non-blocking comment so authors can iterate on skill design with measurable feedback.

This subsystem also lays foundational AWS infrastructure (IAM/OIDC, Bedrock AgentCore, Lambda, Step Functions) that subsequent subsystems — a managed agent and a non-technical builder UX — will reuse.

## Scope

### In scope

- GitHub Actions workflow triggered on pull requests touching `skills/**`
- AWS-hosted execution of each affected skill against a curated prompt set
- LLM-judge scoring against a rubric per skill
- Cost and latency capture per prompt
- PR comment with summary table (sticky, updated on re-run)
- Repo-level `evals/` directory housing prompts and rubrics
- IaC (CDK or Terraform; choice deferred to plan) for all AWS resources
- Unit tests for Lambda handlers, schema validation, comment rendering
- One-time manual validation against the smallest skill before merge

### Out of scope

- Hard merge gates / pass-fail thresholds (results are advisory only)
- Cross-account or multi-region deployment (single region: `us-east-1`)
- Historical-trend dashboards (CloudWatch metrics emitted, but dashboard is later work)
- Auto-generation of test prompts (curated only)
- The managed agent itself (subsystem 2)
- The non-technical builder UX (subsystem 3)

## Non-Goals

- Replace human review of skill quality
- Score every skill on every PR (only changed skills run)
- Block merges or enforce minimum scores (intentionally a soft signal)

## Success Criteria

1. A skill author opens a PR modifying `skills/build-strata-rails-app/SKILL.md`. Within ~10 minutes a PR comment shows quality scores per prompt, total cost, and latency.
2. Adding a new skill with a corresponding `evals/<skill>/` directory automatically gets evaluated on its first PR — no infra changes needed.
3. AWS cost per PR run stays under $1 for a typical 3-prompt skill (target; observed via CloudWatch).
4. Lambda + Step Function patterns are reusable for subsystem 2.

## Architecture

```
GitHub PR (skills/** changed)
        |
        v
+-----------------------------+
| GH Action: skill-eval.yml   |
|  - detect changed skills    |
|  - OIDC -> AWS              |
|  - upload input zip to S3   |
|  - start Step Function      |
|  - poll until done          |
|  - post PR comment          |
+-----------------------------+
        | AssumeRole (OIDC)
        v
+----------------------------------------------+
| AWS account                                  |
|                                              |
|  Step Function: SkillEvalSM (Express)        |
|   |- Map state (per changed skill)           |
|   |    |- Lambda: load-evals                 |
|   |    |- Map state (per prompt, max 5)      |
|   |    |    |- Lambda: run-skill             |
|   |    |    |    `- Bedrock AgentCore        |
|   |    |    |       (skill loaded as ctx)    |
|   |    |    `- Lambda: judge                 |
|   |    |         `- Bedrock InvokeModel      |
|   |    |            (Claude Sonnet judge)    |
|   |    `- Lambda: aggregate                  |
|   `- Final: build report.json -> S3          |
|                                              |
|  S3: skill-eval-artifacts-<account>          |
|       /<run-id>/                             |
|         input.zip, output.json, judge.json,  |
|         report.json                          |
|                                              |
|  CloudWatch: metrics namespace `SkillEval`   |
+----------------------------------------------+
```

### Auth and trust boundaries

- **GitHub -> AWS:** OIDC federation. A repo-scoped IAM role (`gh-oidc-skill-eval-role`) is assumable only by this repository's workflows. Permissions: `s3:PutObject` to a per-run prefix, `states:StartExecution` and `states:DescribeExecution` for `SkillEvalSM`, `s3:GetObject` for the report path.
- **Lambdas:** Each Lambda has a least-privilege role. `run-skill` may invoke AgentCore. `judge` may invoke Bedrock models. All can write CloudWatch logs and metrics; only `aggregate` can write the final report.
- No long-lived AWS keys anywhere.

### Region

Single region: `us-east-1`. Chosen for AgentCore + Bedrock model availability and to keep IaC simple.

## Components

### Repository additions

| Path | Purpose |
| --- | --- |
| `.github/workflows/skill-eval.yml` | Trigger, OIDC, SFN start, poll, comment |
| `evals/<skill>/prompts.json` | Array of `{id, prompt, expected_skill_invoked, rubric_dims}` per skill |
| `evals/<skill>/rubric.md` | Human-readable judge criteria |
| `infra/` | IaC for all AWS resources (CDK or Terraform — chosen in plan) |
| `lambdas/load-evals/` | Python 3.12. Reads `evals/<skill>/prompts.json` from `input.zip` in S3, validates schema, returns prompt list to SFN |
| `lambdas/run-skill/` | Python 3.12. Loads SKILL.md as context, calls AgentCore, captures output + metrics |
| `lambdas/judge/` | Python 3.12. Calls Bedrock with rubric + skill + prompt + output, returns score JSON |
| `lambdas/aggregate/` | Python 3.12. Reads judge artifacts, builds report, emits CloudWatch metrics |
| `scripts/post-comment.py` | Renders markdown table from `report.json` and posts a sticky PR comment |
| `scripts/eval_local.py` | Runs full pipeline against AWS, skipping the GH layer (for skill authors) |

### AWS resources

- **IAM:** `gh-oidc-skill-eval-role` (assumed by GH), `lambda-exec-role-load-evals`, `lambda-exec-role-run-skill`, `lambda-exec-role-judge`, `lambda-exec-role-aggregate`
- **Step Function:** `SkillEvalSM` (Express workflow, 5 min execution cap, max 5 concurrent prompts in inner Map)
- **Lambdas:** `load-evals`, `run-skill`, `judge`, `aggregate` (Python 3.12, 1024 MB; provisioned concurrency = 1 for `run-skill` and `judge`)
- **S3:** `skill-eval-artifacts-<account-id>` with 30-day lifecycle expiry on all objects
- **Bedrock:** AgentCore agent `skill-eval-agent`, model access for `claude-sonnet-4-6`
- **CloudWatch:** Log groups per Lambda; custom metrics under namespace `SkillEval` (`QualityScore`, `TokensIn`, `TokensOut`, `LatencyMs`, `CostUsd`)
- **Budget alarm:** $50 daily threshold on the `SkillEval` cost-allocation tag, SNS to a human distro

### Models

- **Skill runtime:** Claude Sonnet 4.6 — matches what real users see in Claude Code, good cost/quality balance.
- **Judge:** Claude Sonnet 4.6, `temperature=0` — same family, deterministic-as-possible scoring. Document expected ±1 point variance.

### Eval prompt schema

`evals/<skill>/prompts.json`:

```json
[
  {
    "id": "happy-path-1",
    "prompt": "Scaffold a rails app",
    "expected_skill_invoked": true,
    "rubric_dims": ["correctness", "completeness", "follows_skill_steps"]
  }
]
```

`rubric_dims` keys must exist in the corresponding `rubric.md` so the judge can score each.

## Data Flow

1. PR opens or updates with changes under `skills/**`.
2. `skill-eval.yml` runs.
   - `git diff --name-only origin/main...HEAD | grep ^skills/` -> list of changed skill directories. Empty -> exit 0.
3. GH Action assumes the AWS role via OIDC (`aws-actions/configure-aws-credentials`).
4. GH Action zips changed `skills/<x>/` and `evals/<x>/` directories and uploads to `s3://skill-eval-artifacts-<account>/<run_id>/input.zip` (avoids passing large payloads through Step Functions state).
5. GH Action calls `StartExecution` on `SkillEvalSM` with input:
   ```json
   {
     "run_id": "<pr-number>-<commit-sha>",
     "skills": ["build-strata-rails-app"],
     "pr_number": 42,
     "commit_sha": "abc123"
   }
   ```
6. Step Function:
   - Outer `Map` over `skills[]`:
     - `load-evals` Lambda reads `evals/<skill>/prompts.json` from `input.zip` in S3.
     - Inner `Map` over `prompts[]` (max concurrency 5):
       - `run-skill` Lambda:
         - Loads `skills/<skill>/SKILL.md` as system context
         - Invokes an AgentCore session with the user prompt
         - Captures response text, tool calls, token counts (input + output), wall time
         - Writes `s3://.../<run_id>/<skill>/<prompt_id>/output.json`
       - `judge` Lambda:
         - Reads output + rubric
         - Builds judge prompt: rubric dimensions + skill description + user prompt + skill output
         - Calls `bedrock:InvokeModel` (Claude Sonnet 4.6)
         - Parses `{quality: 0-10, dims: {...}, rationale: "..."}`. Retries up to 3 times on parse failure with stricter system prompt; if still failing, writes `{score: null, error: "parse-failed"}`.
         - Writes `s3://.../<run_id>/<skill>/<prompt_id>/judge.json`
   - `aggregate` Lambda:
     - Reads all judge + output artifacts
     - Computes: average quality, total tokens, total cost (price x tokens), p50 / p95 latency
     - Writes `s3://.../<run_id>/report.json`
     - Emits CloudWatch metrics under namespace `SkillEval`
7. GH Action polls `DescribeExecution` until `SUCCEEDED` or `FAILED`. Timeout: 10 minutes.
8. GH Action downloads `report.json`, runs `post-comment.py`:
   - Renders a markdown table: `skill | prompt | quality | tokens | cost ($) | latency (s)`
   - Posts or updates a sticky PR comment, identified by the marker `<!-- skill-eval-bot -->`

## Error Handling

| Failure | Handling |
| --- | --- |
| GH OIDC assume-role fails | GH job fails, no PR comment. Author retries via `Re-run`. |
| Changed skill has no `evals/<skill>/` directory | `load-evals` returns empty list. Report row says `no evals defined`. PR comment soft-warns. |
| Malformed `prompts.json` | `load-evals` fails fast with a schema error. SFN catches; aggregate marks the skill as `eval-config-error`. Comment reflects this. |
| AgentCore session timeout (>2 min) | `run-skill` kills the session, writes output with `status: timeout` and partial response. Judge skips and marks `not-judged`. |
| Bedrock throttling (`ThrottlingException`) | Lambda retries with exponential backoff (3 attempts, base 2s). SFN-level retry on `Lambda.ServiceException`. |
| Judge returns non-JSON | Parser retries 3 times with stricter system prompt. On final failure, judge.json marks `score: null, error: parse-failed`. |
| Lambda cold start blows latency budget | Provisioned concurrency = 1 on `run-skill` and `judge`. |
| S3 write fails | SFN retry with backoff. Final failure -> run marked `infra-error`. PR comment shows error rather than score. |
| SFN execution exceeds 5 minutes | Express workflows cap at 5 min. If real runs trend longer, switch to Standard workflow (decided during implementation). |
| Cost runaway | Per-prompt token cap: 8K input / 4K output. SFN inner Map `maxConcurrency = 5`. Daily budget alarm at $50 -> SNS notification to a human. |
| GH poll timeout (10 min) | Action posts an "eval still running, see CloudWatch link" comment with a non-blocking warning. |

**Sticky-comment policy:** every failure mode produces a comment. There are no silent failures.

**Idempotency:** `run_id = <pr-number>-<commit-sha>`. Re-runs on the same SHA reuse existing S3 artifacts (each Lambda checks S3 before re-computing). This keeps re-run cost near zero.

## Testing

### Unit tests (pytest, in repo)

- `tests/lambdas/test_run_skill.py` — mock AgentCore SDK; assert request shape, output schema, timeout handling
- `tests/lambdas/test_judge.py` — mock Bedrock; assert rubric-aware prompt construction, JSON parse with retries, error path
- `tests/lambdas/test_aggregate.py` — fixture S3 directory; assert `report.json` numbers (avg, p95, totals)
- `tests/scripts/test_post_comment.py` — golden-file markdown render; mock GitHub API

### Schema tests

- `tests/test_eval_schema.py` — every `evals/<skill>/prompts.json` validates against a JSON schema
- Extension to `scripts/lint_skills.py`: warn (not fail) if `skills/<x>/` exists without a matching `evals/<x>/`

### Integration

- `scripts/eval_local.py` — runs the full pipeline against AWS, bypassing the GH layer. Used by skill authors to sanity-check before pushing.
- Nightly cron full-suite eval against `main` is **out of scope here** but planned as follow-up work feeding subsystem 2.

### CI smoke tests

- `tests/test_workflow_yaml.py` — parses `.github/workflows/skill-eval.yml`; asserts OIDC permissions, required steps
- `tests/infra/test_cdk_synth.py` (or Terraform-plan equivalent) — synthesizes infra, snapshot-tests resources

### Manual validation (one-time, before merging the harness PR)

- End-to-end run on the `hello-world` skill (smallest blast radius)
- Confirm: PR comment renders, S3 artifacts present, CloudWatch metrics emitted, cost matches estimate

### Knowingly untested

- Real Bedrock model output quality (judge variance) — accepted noise; mitigated by `temperature=0` and documented ±1 score variance
- AgentCore SDK behavior changes — pin SDK version, monitor release notes

## Open Questions for Implementation Plan

These are deliberately deferred to the writing-plans step:

- IaC tool: CDK (TypeScript) vs Terraform. Tradeoffs: CDK aligns with TS-heavy AWS examples; Terraform aligns with broader Nava infra conventions.
- Step Function flavor: Express (5 min cap) vs Standard. Default to Express; switch if observed runs exceed 5 min.
- Concrete cost model and budget number for nightly + per-PR usage.
- Where `eval_local.py` reads AWS credentials from (`AWS_PROFILE` vs SSO).

## How This Feeds Subsystem 2 (Managed Agent)

The infrastructure built here is deliberately reusable:

- **OIDC + IAM patterns** — same role-assumption pattern will gate an external chat UI calling AWS.
- **Step Functions + Lambda** — the same fan-out / coordinate / aggregate pattern fits a multi-step agent workflow.
- **AgentCore agent** — `skill-eval-agent` is a stripped-down version of what subsystem 2 will operate at scale.
- **Skill-as-context loader** — the `run-skill` Lambda's mechanism for loading a skill into Claude's context is the exact mechanism the managed agent will use.

Subsystem 2 will likely promote `skill-eval-agent` to a richer agent with persistent state and tool access; the eval harness keeps it stateless and constrained.
