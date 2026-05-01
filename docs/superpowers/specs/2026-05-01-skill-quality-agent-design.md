# Skill Quality Agent — Design

**Date:** 2026-05-01
**Status:** Draft for review
**Owner:** baonguyen@navapbc.com

## Problem

The repo's existing `scripts/lint_skills.py` enforces structural rules on `SKILL.md` files (frontmatter, naming, line count, voice in description). It does **not** evaluate whether a skill is *substantively* good — i.e. whether the description is specific enough to trigger correctly, whether the body teaches the reader, whether referenced files exist, or whether anti-patterns slip into the body.

We want a CI-side agent that evaluates each changed `SKILL.md` on substance, posts feedback to the PR, and fails the pipeline when critical issues are found.

## Goals

- Detect substance-level quality issues on changed skills before merge.
- Provide actionable, line-anchored feedback to authors.
- Hard-block merges only on issues severe enough that the skill is broken or unusable; surface lower-severity findings as advisory.
- Stay cheap on routine PRs through content-hash caching.

## Non-goals

- Behavioral evaluation (running a synthetic scenario through the skill).
- Description/body alignment scoring beyond what the rubric covers.
- Cross-skill dependency graph analysis.
- Scheduled full-repo sweeps.
- Auto-fix PRs.
- Replacing `lint_skills.py` — the new agent runs *after* the linter passes.

## Quality dimensions evaluated

The agent scores four dimensions per skill:

| ID | Dimension | What it checks |
|----|-----------|----------------|
| A | **Triggerability** | Description specific enough that future Claude reliably picks this skill; not vague, not pure restatement of name, distinguishable from sibling skills. |
| B | **Instructional clarity** | Body teaches *how*, not just *what*. Concrete examples present. No placeholders. Sufficient substantive content. |
| C | **Self-containedness** | Skill is usable without hidden context. Any file/path referenced from the body actually exists in the repo. |
| D | **Anti-patterns absent** | No banned phrases (first/second-person leakage in body), no contradictions with `CLAUDE.md` authoring standards, no filler/hedging that the project explicitly discourages. |

Dimensions E (behavioral correctness) and F (description/body alignment) are deferred — explicitly out of scope.

## Severity tiers

The agent classifies each finding into one of three tiers. Pipeline pass/fail is determined by tier, not by aggregate score:

- **critical** — fails the pipeline (`exit 1`). Skill is broken or unusable as-is.
- **major** — surfaces as a `::warning` annotation and PR comment entry. Does not fail the pipeline.
- **minor** — surfaces in the PR comment only. Does not annotate or fail.

### Critical-tier definitions

A finding is `critical` only if it falls into one of these categories:

- **A (triggerability)**: description fewer than 30 characters of substantive content, or contains no domain nouns, or is a pure restatement of the skill `name`. The bar: a future Claude reading only the description would have no signal to invoke this skill over any other.
- **B (instructional clarity)**: body contains placeholder tokens (`TODO`, `TBD`, `XXX`, `Lorem ipsum`), or fewer than 20 lines of substantive content (excluding frontmatter and headings), or zero concrete examples.
- **C (self-containedness)**: body references a file path or `references/...` resource that does not exist in the repo.
- **D (anti-patterns)**: first- or second-person voice in the description (this overlaps with the linter and acts as a confirmation gate), or content directly contradicts a rule stated in `CLAUDE.md`.

Anything else in A–D is `major` or `minor` at the agent's judgment.

## Architecture

### Trigger

New workflow `.github/workflows/eval-skills.yml`:

- Triggers on `pull_request` events where `skills/**/SKILL.md` is in the diff.
- Runs **after** the existing `lint-skills.yml` succeeds — sequenced via `needs:` if combined into one workflow file, or via a separate workflow that depends on lint via `workflow_run`. Decision deferred to implementation; the constraint is that the agent must not run if the linter fails.

### Runtime

- **Cursor TypeScript SDK** (`@cursor/sdk`) in **local mode** — agent runs inside the GitHub runner, reads files from the checked-out workspace via `local: { cwd: process.cwd() }`. No cloud VM, no `autoCreatePR`.
- Driver script: `scripts/eval_skills.ts`.

### Driver flow

1. Compute changed skills:
   ```
   git diff --name-only origin/${{ github.base_ref }}...HEAD -- 'skills/*/SKILL.md'
   ```
   Yields zero or more skill paths.
2. For each changed `SKILL.md`:
   - Compute `sha256` of the file contents.
   - Look up `.cache/skill-eval/<sha256>.json` (cache restored via `actions/cache@v4` — see "Caching").
   - Cache hit: load result, skip agent call.
   - Cache miss: run agent.
3. Run agents concurrently with `Promise.all`, concurrency cap of **4** (avoid runaway parallelism on large PRs).
4. Aggregate per-skill JSON results.
5. Render PR comment (sticky, marker-based) and emit `::warning` / `::error` annotations.
6. Exit code: `1` if any finding has `tier: critical`, else `0`.

### Agent prompt

A single rubric prompt template lives at `scripts/skill_eval_prompt.md` and is loaded by the driver. The driver substitutes per-skill values (skill content, repo rules excerpt) and sends one `agent.send()` call per skill.

The prompt instructs the agent to:

- Read the provided `SKILL.md` content.
- Read the provided repo rules excerpt (`CLAUDE.md` authoring standards + linter constraints).
- For dimensions A, B, C, D, decide a per-dimension verdict (`pass` / `warn` / `fail`) and list findings.
- Each finding has: `tier`, `dimension`, optional `line`, `message`, `recommendation`.
- Return strict JSON matching the schema below — no prose outside the JSON.

The human-readable single-source-of-truth rubric (with example findings, tier examples, edge cases) lives at `docs/skill-quality-rubric.md`. The prompt template references this rubric by including its full text inline at substitution time, so a single edit to the rubric updates agent behavior.

### Output JSON schema

The agent must return:

```json
{
  "skill": "skill-name",
  "dimensions": {
    "triggerability":         {"verdict": "pass|warn|fail", "summary": "..."},
    "instructional_clarity":  {"verdict": "pass|warn|fail", "summary": "..."},
    "self_containedness":     {"verdict": "pass|warn|fail", "summary": "..."},
    "anti_patterns":          {"verdict": "pass|warn|fail", "summary": "..."}
  },
  "findings": [
    {
      "tier": "critical|major|minor",
      "dimension": "A|B|C|D",
      "line": 42,
      "message": "Description is a pure restatement of the skill name.",
      "recommendation": "Add a concrete domain noun and the trigger phrase Claude should match."
    }
  ],
  "overall": "pass|warn|fail"
}
```

`overall` is derived (highest-severity tier across all findings → mapped to `fail`/`warn`/`pass`). The driver recomputes `overall` from `findings` and ignores the agent's value if they disagree, to keep behavior deterministic.

The driver validates this schema before consuming. On schema violation, the result is treated as a hard failure for that skill (exit non-zero, comment notes "agent returned malformed output").

### Caching

- **Storage**: GitHub Actions cache (`actions/cache@v4`), not committed to the repo.
- **Restore step**: at job start, restore `.cache/skill-eval/` keyed on `hashFiles('skills/**/SKILL.md')` with restore-keys fallback to the most recent partial.
- **Save step**: at job end, save the same path so successful evals on this PR seed future PRs.
- **Per-skill key**: each cache file is named `<sha256(SKILL.md_content + RUBRIC_VERSION)>.json`. Identical content + same rubric version → cache hit.
- **Invalidation**: any change to `SKILL.md` content rotates the hash. To force re-eval after a rubric or prompt-template change, bump the `RUBRIC_VERSION` constant in `scripts/eval_skills.ts` — every skill's hash rotates, all entries miss, all skills re-eval on next PR run.

### Surfacing

Two output channels, both produced from the same per-skill JSON:

1. **PR comment** — single sticky comment maintained by `peter-evans/create-or-update-comment` (or equivalent), keyed on an HTML marker like `<!-- skill-eval-bot -->`. Updates on each re-run instead of stacking. Content:
   - Summary line: `N skills evaluated — X passed, Y warnings, Z critical`.
   - One section per skill: dimension verdict table + findings grouped by tier, with top 3 recommendations bubbled up.
2. **Check annotations** — emitted via `::error file=…,line=N::message` for `critical` findings and `::warning file=…,line=N::message` for `major`. `minor` findings only appear in the PR comment.

### Secrets and permissions

- `CURSOR_API_KEY` — added as a repo secret. Exposed to the workflow via `env: CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}`.
- `GITHUB_TOKEN` — auto-provided by Actions; used for PR comment write.
- Workflow permissions:
  ```yaml
  permissions:
    contents: read
    pull-requests: write
    checks: write
  ```

### Concurrency / cost guardrails

- Per-skill concurrency cap: 4 parallel agent calls.
- No per-skill token budget at v1 — content-hash caching is the primary cost control.
- No PR-size cap at v1 — re-evaluate if PRs in practice ever change >20 skills.

## Files added or modified

| Path | Purpose |
|------|---------|
| `.github/workflows/eval-skills.yml` | Workflow definition. |
| `scripts/eval_skills.ts` | Driver: diff, cache lookup, agent invocation, output rendering, exit code. |
| `scripts/skill_eval_prompt.md` | Rubric prompt template loaded by the driver. |
| `docs/skill-quality-rubric.md` | Human-readable rubric — single source of truth, inlined into the prompt at substitution time. |
| `package.json` | Add `@cursor/sdk` dependency. (Currently a 51-byte stub — needs proper init.) |
| `tsconfig.json` | TS config for the driver. |
| `tests/test_eval_skills.ts` | Unit tests for diff parsing, cache hit/miss, JSON→annotation/comment rendering, exit-code logic. The Cursor SDK is mocked. |
| `tests/fixtures/skills/` | Fixture skills covering good / critical-fail / major-only / mixed cases. |

## Testing

Unit tests cover the deterministic parts (everything except the agent call):

- Diff parser correctly identifies changed `SKILL.md` paths from a synthetic git output.
- Cache hit reuses stored JSON; cache miss invokes the (mocked) agent.
- Schema validator rejects malformed agent output and produces a critical finding for that skill.
- Annotation renderer emits correct `::error`/`::warning` lines for each tier.
- PR comment renderer produces stable, marker-anchored markdown.
- Exit code is `1` iff any finding is `critical`.

The agent itself is not tested in CI — its behavior is verified manually against the fixture skills during development.

## Implementation choices fixed in this spec

- **Workflow layout**: extend `.github/workflows/lint-skills.yml` with a second job `eval` that has `needs: lint`. Single workflow file, single PR check group, atomic ordering. No `workflow_run` indirection.
- **Driver language**: TypeScript. Cursor SDK ships TS types; type safety on the agent JSON schema is worth the small toolchain (`tsx` for execution in CI, no build step required).

## Risks

- **Agent non-determinism**: same input may yield different findings across runs. Mitigation: content-hash caching makes the *first* run authoritative; subsequent re-runs reuse it. Bumping `RUBRIC_VERSION` is the explicit re-eval lever.
- **False-positive criticals blocking PRs**: a too-aggressive rubric will frustrate authors. Mitigation: ship with conservative critical definitions (above), expand only after observing real PRs.
- **Cursor API outage**: workflow fails opaquely. Mitigation: driver catches SDK errors and posts a comment noting "skill quality check skipped — Cursor API unavailable", exits 0 (does not block merge on infra failure).
- **Cost surprises**: token spend grows with skill count and rubric size. Mitigation: caching + concurrency cap + monitor for first month before raising caps.
