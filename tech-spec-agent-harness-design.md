# Agent Harness Design Tech Spec

> [!IMPORTANT]
> This document references two core methodologies:
> - **Superpowers**: [An agentic skills framework & software development methodology](https://github.com/obra/superpowers)
> - **Compound Engineering**: [A framework for agent-native architecture and self-improving systems](https://github.com/EveryInc/compound-engineering-plugin)

| Field        | Value |
| ------------ | ----- |
| Author       | Bao Nguyen |
| Date         | 2026-05-13 |
| Reviewed by  | _TBD_ |
| Status       | Draft |

> Google Doc: https://docs.google.com/document/d/1TORwUp7JxrW7NJTeqR8vAENFV0HZ70gnr_NdT_eH8Qc/edit
>
> Source design spec (deep dive): `docs/superpowers/specs/2026-05-13-agent-harness-design.md`. Section references below (e.g. "§4") point into that file, except for §11 sub-references (§11.1–§11.5), which point to the restructured sub-sections in this tech spec — see "Self-Improvement Layer" below.

## Overview

Three Strata skills (`build-strata-rails-app`, `build-strata-sdk-model`, `build-strata-app-form-views`) are currently in development through a spike and do not yet chain. Running them in sequence in one Claude Code session blows past the context window; verification is unreliable; and the demo cadence is too slow. Furthermore, the lack of a headless or cloud mode is a blocker for an "AI native" workflow.

The harness fixes these pain points by implementing the architectural thesis: **the orchestrator is a dispatcher, not a doer**. A file-on-disk artifact contract between phases lets each phase run in a fresh sub-agent context. The same skill content is reused by two runtimes — a Claude Code plugin and a headless Anthropic-SDK CLI shim — enabling both interactive IDE development and unattended CI execution.

A core concept of the harness is the **Self-Improving Skill Layer**. The harness includes the tooling necessary to update and improve its own skills, hooks, and context based on feedback loops (e.g., reviewer comments on generated PRs), ensuring the system matures without manual intervention. See §1 for the full pain-point analysis.

## Goals and Product Requirements

From §2 Goals (v1):

- Produce a working **member-side application-form demo** end-to-end from either a free-form prompt or a `demo.yaml` spec.
- Run in **two runtimes** sharing the same skill files: a Claude Code plugin (local IDE) and a headless Anthropic-SDK CLI shim (cloud).
- Use **configurable gates**: default = pause at spec, plan, final; `--unattended` = no in-process pauses (the harness exits at the end of `verify` with a status marker for the runner to surface).
- **Hard dependency on `obra/superpowers`** for the methodology layer (brainstorming, writing-plans, executing-plans, subagent-driven-development, TDD, verification-before-completion).
- Steal one idea from Compound Engineering: a `strata-compound-learnings` skill that codifies per-demo lessons; avoid CE's 51 named agents.
- **Self-improving harness**: Implement a closed-loop layer that uses feedback (reviewer comments, validation failures) to automatically draft improvements to skills, hooks, and context.

## Assumptions

- **`obra/superpowers` is a peer dependency** and remains available — the harness leans on its methodology skills directly (§2).
- **Anthropic API access** is available wherever the headless shim runs (env var `ANTHROPIC_API_KEY`, §13).
- **Docker is available on every cloud runner** in v1 (§13). Local developer machines use the Claude Code plugin instead and do not need Docker.
- **GitHub Actions is the v1 cloud surface** (§13, §20.2). The harness itself is runtime-agnostic; the workflow surface can be swapped later.
- **Plugin-based distribution**: While the SPIKE used an npm-skills distribution model, the production harness ships skills, hooks, and other content via plugins. It supports the Claude Code plugin natively; for other agents like Cursor, manual installation files are provided to bridge the gap (§5).
- **The existing Strata SDK skills are the initial spike implementation** (§2). v1 does not refactor them; it composes them.
- **Reviewer comments on harness-generated PRs** are a primary trigger for skill self-improvement, though other triggers (e.g., validation failures, manual invocation) are supported by the underlying improver tooling (§11.1).

## Out of Scope

Merged from §3 Non-Goals and §17 "Out of scope (v2+)":

- Case views skill, BusinessProcess DSL skill, Task subclass skill, end-to-end event wiring (v2).
- Deploy / auth / seeded production-fidelity data (vX).
- Cross-demo learning aggregator — org-wide insights mined from many demos (v2+).
- Support for non-Rails Strata templates (Next.js, Python).
- Opening PRs from the harness. The runner (CI / webhook / Slackbot/ Skill) owns push + PR open (§3, §13).
- Post-write USWDS / a11y validation hook (v2).
- Auto-merging skill-improvement PRs (always draft → human-gated in v1, §11.3).
- Cross-skill or shared-infra edits from the skill-improver — single-skill scope only in v1 (§11.3).
- Multi-skill comment routing — v1 picks the most directly implicated skill; v2 fans out (§20.6).

## Open Questions

From §20 (recommended defaults are noted in-line; confirm on review):

1. **Per-demo repo strategy.** Default: each demo is its own Git repo in `<workdir>`. The runner decides where to push. Alternative: a `strata-demos` monorepo with one branch per demo.
2. **Cloud runner choice for v1.** Default: GitHub Actions. Alternative: Anthropic Managed Agents when available.
3. **`demo.yaml` ergonomics.** Default: ship the verbose SDK-informed template; add a "presets" mechanism in v2.
4. **Compound-learnings location.** Default: `LEARNINGS.md` in the generated repo. Alternative: a central `strata-harness-learnings` repo. Either way, `LEARNINGS.md` entries feed back into harness improvement as input to the skill-improver loop (§11).
5. **Hook portability across runtimes.** Default: accept per-runtime trigger duplication; markdown content stays shared (§10.3).
6. **Skill-improver scope creep.** Default: improver picks the most directly implicated skill (highest evaluator confidence; tie-break deeper-in-stack: model > views > app scaffold) and notes secondaries in the PR body.
7. **Improver re-entry on rejected lint.** Default: abort with a comment back on the original PR; iterative self-repair is v2.

## Approach

Five discrete phases over a file-on-disk artifact contract, dispatched by a thin orchestrator. The same skill content runs under two runtimes. Skill content is itself improved via a closed reviewer-comment loop.

### Linear Pipeline (§4)

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  intent  │ → │   spec   │ → │   plan   │ → │  build   │ → │  verify  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
intent.md       demo.yaml      plan.md        build/        verification.md
                                              (commits)
```

Each phase is **one skill**; the orchestrator never does work directly. It reads the previous phase's artifact, decides whether to gate, dispatches a fresh sub-agent for the next phase with that artifact loaded, and writes the new artifact when the sub-agent completes. The build phase internally dispatches one sub-agent per Strata-skill invocation (rails-app, sdk-model, app-form-views), each with its own fresh context.

### Two Runtimes, One Set of Skills (§5)

```
                  shared content (plugins/hooks)
              ┌────────────────────────────────┐
              │  skills/<skill>/SKILL.md        │
              │  skills/<skill>/references/*    │
              │  schemas/demo.yaml.json         │
              │  prompts/phase-*.md             │
              └────────────────┬───────────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                             │
┌───────▼────────────┐                ┌───────────────▼──────────┐
│ Claude Code plugin │                │ Headless CLI shim         │
│ (.claude-plugin)   │                │ (Anthropic SDK, Node/TS)  │
│                    │                │                           │
│ - slash commands   │                │ - `strata-harness build`  │
│ - skills auto-load │                │ - phase loop              │
│ - Task-tool        │                │ - own sub-agent dispatch  │
│   subagent dispatch│                │   (parallel API calls)    │
│ - interactive gates│                │ - sandbox = Docker image  │
└────────────────────┘                └───────────────────────────┘
        ▲                                             ▲
        │ used by:                                    │ used by:
   developer in IDE                              cloud agent / CI
```

Shared content is distributed via plugins (e.g., the Claude Code plugin) rather than a raw npm package. For non-plugin agents like Cursor, custom installation scripts/files are used to load the same content. The CC plugin uses Claude Code's native sub-agent dispatch (Task tool). The headless shim is a Node/TypeScript binary that re-implements the same dispatch loop using the Anthropic SDK directly.

### Canonical Artifact Contract (§6)

Files under `<workdir>/.strata-harness/`:

| File | Owner phase | Purpose |
|---|---|---|
| `intent.md` | intent | Raw user prompt or normalized intent narrative |
| `demo.yaml` | spec | Canonical spec — the contract for all later phases |
| `plan.md` | plan | Ordered list of skill invocations + per-step success criteria |
| `build/transcripts/<phase>.log` | build | Per-sub-agent transcripts (for debugging) |
| `verification.md` | verify | Lint/test/walkthrough output + final disposition |
| `LEARNINGS.md` | post-run | Compound-learnings entry plus a structured `skill_invocations:` block mapping each generated file path → owning skill name + version. The skill-improvement loop reads this block to route reviewer comments back to the correct skill. |

Schema validation: `demo.yaml` is JSON-Schema-validated at the start of every phase that reads it — both runtimes fail fast on a malformed spec. See **Schema Changes** below for the v1 shape.

### Phase Definitions (§7)

- **`intent`** — Free-form prompt → `intent.md`. Skipped if input is already `demo.yaml`.
- **`spec`** — Brainstorming-flavored Q&A reusing the existing skills' interview steps (without invoking the build skills) → `demo.yaml`. **Gate #1** (default; suppressed by `--unattended`).
- **`plan`** — Read `demo.yaml`; emit ordered skill invocations. v1 ordering is fixed: rails-app → sdk-model → app-form-views. → `plan.md`. **Gate #2** (default; suppressed by `--unattended`).
- **`build`** — Each `plan.md` step dispatched as a fresh sub-agent. Transcripts persisted; their context is **not** rolled up into the parent. → working Rails app + git commits in `<workdir>/<app_name>/`.
- **`verify`** — `make lint`, `make test`, Claude-in-Chrome walkthrough → `verification.md`. **Gate #3**: blocking in CC plugin; in `--unattended` the harness exits with `verify.passed` / `verify.failed` and the runner surfaces it.

### Sub-Agent Isolation (§8)

- CC plugin: each phase dispatches a Claude Code Task with a curated prompt loading only that phase's artifact + the relevant SKILL.md. Per-phase token budget; on overflow, sub-agent compacts and continues.
- Headless shim: each phase is an independent Anthropic API conversation. System prompt = `prompts/phase-<n>.md` + SKILL.md + artifact. Tool-use loop runs until the sub-agent emits the next artifact and exits.
- The build phase can parallelize sub-agents for independent skills (none in v1; v2 will parallelize across multiple Strata programs).

### Configurable Gates (§9)

| Flag | Effect |
|---|---|
| `--input <file-or-prompt>` | Hybrid input. `.yaml` skips intent; string runs intent first. |
| `--workdir <path>` | Artifacts + generated app. Default `./strata-demo-<timestamp>`. |
| `--unattended` | Suppresses spec/plan gates; final phase exits with a status marker. |
| `--resume` | Continues from the first un-completed phase. |
| `--phase <name>` | Run only that phase (used after editing an artifact). |
| `--gates spec,plan,final` | Override the default gate set explicitly. |

Headless shim, default (not `--unattended`): writes `<phase>.awaiting-review` and exits 0. Resume with `--resume`.

### Pre-Write Hooks + Design-Context Packs (§10)

The Strata SDK is deliberately unopinionated about UI; without an opinion the agent invents inconsistent UX per run. Two findings drive this section: **markdown context packaged with the skill works**, and **hooks beat rules** (passive rules-files did not move quality; an actively-firing hook did).

- **Convention (§10.1):** every build-time skill that produces user-facing artifacts ships `references/design-patterns.md` + `references/ui-kit-components.md`. The linter gains an optional warn-only check.
- **Pre-write injection hook (§10.2):** a Claude Code `PreToolUse` hook (`hooks/inject-design-context.sh`) intercepts `Edit`/`Write` against `app/views/**`, `app/components/**`, `app/javascript/**`, `app/helpers/**`. When matched, it prepends the active skill's two reference files as a `<system-reminder>` to the next assistant turn. No-op if the active skill has no design-context pack — safe to enable globally.
- **Shim parity (§10.3):** the headless shim re-implements the same gate in TypeScript before forwarding matching tool-use blocks. The *trigger* is per-runtime; the *content* (the markdown files) is identical.

### Self-Improvement Layer (§11)

The harness is designed to be self-improving via a "Dispatch Hub" feedback loop. Reviewer comments on any harness-generated repository are routed back to the central `strata-agent-harness` repo to trigger automated skill improvements.

```
[Generated Repo]                                     [Harness Repo]
PR Comment ──► GH Action (feedback-to-harness.yml) ──► repository_dispatch ──►
   GH Action (skill-improve.yml) ──►
      strata-skill-comment-evaluator (which skill? + confidence) ──►
         strata-skill-improver (plan → edit → lint → PR)
```

- **Scaffolding (§11.1):** The `build` phase scaffolds `.github/workflows/feedback-to-harness.yml` into every generated repository.
  - **Trigger:** `issue_comment.created` on PRs labeled `harness-generated`.
  - **Action:** Sends a `repository_dispatch` to `strata-agent-harness` with the comment context.
  - **Auth:** Requires a `STRATA_HARNESS_DISPATCH_TOKEN` secret (PAT or GitHub App token) in the generated repo.
- **Trigger (Harness Repo, §11.2):** `.github/workflows/skill-improve.yml` is triggered by `repository_dispatch` (event_type: `feedback_from_generated_repo`).
- **Two new skills (§11.3):**
  - `strata-skill-comment-evaluator` — LLM-as-judge. Reads the dispatch payload + `LEARNINGS.md` telemetry. Returns `implicated_skill`, `confidence`, `reason`.
  - `strata-skill-improver` — given an implicated skill + legitimate comment, plans focused edits via `superpowers:writing-plans` + `superpowers:writing-skills`, runs `python scripts/lint_skills.py`, opens a draft PR against `strata-agent-harness`.
- **Telemetry contract (§11.4):** the build phase writes a structured `skill_invocations:` block into `LEARNINGS.md` mapping produced files → owning skill name + version. The evaluator uses this to deterministically map `comment.path` → `implicated_skill`.
- **Local vs. Cloud Setup (§11.5):**
  - **Local Developer:** Harness prompts the dev to add the `STRATA_HARNESS_DISPATCH_TOKEN` secret to their new repo after push.
  - **Cloud Agent:** The cloud runner (e.g., a "demo factory" workflow) automatically injects the secret into the new repo during the build/push process.

### Compound-Learnings Skill (§12)

Runs after `verify`. Appends one `LEARNINGS.md` entry per build: what in the spec turned out wrong, validation surprises, SDK contradictions, actual time-to-demo. `LEARNINGS.md` lives in the generated repo (per-demo). Cross-demo aggregation is v2+.

Compound-learnings is descriptive (the journal); the skill-improver is prescriptive (the editor). The two are complementary by design.

### Alternatives Considered (§14)

Option 1 — **Claude Code plugin only**, cloud runs `claude -p` non-interactively with the same plugin — was rejected in favor of the CC plugin + headless SDK shim (Option 3). Trade-offs:

- *Pro Option 1:* skips ~1.5–2k LOC of shim + Docker; no second sub-agent dispatch impl; single mental model.
- *Con Option 1:* `claude -p` is interactive-first (timeouts, compaction edges); cloud auth surface messier; sandboxing inherits CC's permission model; queueing/telemetry harder.

### Repo Layout + Critical Files (§15, §18)

Production repo: `strata-agent-harness`. Key paths:

```
strata-agent-harness/
├── .claude/settings.json                    # NEW — registers PreToolUse hook
├── .claude-plugin/plugin.json               # CC plugin manifest (peer-deps superpowers)
├── .github/workflows/skill-improve.yml      # NEW — §11.2 Listener
├── hooks/inject-design-context.sh           # NEW — §10.2
├── templates/                               # NEW — Scaffolded files
│   └── feedback-to-harness.yml              # §11.1 Scaffolded into generated repos
├── skills/
│   ├── build-strata-rails-app/references/   # gains design-patterns.md + ui-kit-components.md stubs
│   ├── build-strata-sdk-model/references/   # gains stubs
│   ├── build-strata-app-form-views/         # already has both
│   ├── strata-harness-orchestrator/         # NEW
│   ├── strata-harness-{intent,spec,plan,verify}/  # NEW phase skills
│   ├── strata-compound-learnings/           # NEW
│   ├── strata-skill-comment-evaluator/      # NEW
│   └── strata-skill-improver/               # NEW
├── shim/src/                                # NEW — cli, orchestrator, phases/, subagent, hooks, sandbox
├── schemas/demo.yaml.json                   # NEW
├── docker/Dockerfile                        # NEW — Ruby+Rails+Node+nava-platform+Strata
└── docs/superpowers/specs/2026-05-13-agent-harness-design.md
```

Existing files referenced but unchanged in v1: the three Strata build skills' `SKILL.md` files and `scripts/lint_skills.py`.

## Schema Changes

No application database schema changes — the harness operates on files-on-disk. The only new schema is the canonical `demo.yaml` artifact contract (§6), JSON-Schema-validated at the start of every phase that consumes it.

v1 `demo.yaml` shape (mirrors the Strata SDK generator surface):

```yaml
program: unemployment              # PascalCased internally
app_type: unemployment              # one of the known types in build-strata-sdk-model
model:
  kind: application_form            # plain | application_form | case | business_process | task
  name: UnemploymentApplicationForm
  attrs:                            # per build-strata-sdk-model Step 4d
    - { name: applicant_name, type: name }
    - { name: birth_date, type: memorable_date }
    - ...
  validations:                      # per Step 4e
    applicant_name: [{ rule: presence, on: name }]
    ...
views:                              # per build-strata-app-form-views Step 5
  flow_class: UnemploymentApplicationFormFlow
  pages:                            # one per validation `on:` context
    - { name: name, fields: [first_name, last_name], widget: name }
    - ...
  tasks:
    - { name: personal_information, pages: [name, date_of_birth], depends_on: [] }
    - ...
  include_index_page: true
  include_show_page: true
  include_review: true
  include_confirmation: true
```

v2 adds `case`, `business_process`, and `tasks` top-level blocks.

## Security and Privacy

- **API key handling.** `ANTHROPIC_API_KEY` is consumed from environment in both runtimes; in the Docker image it is passed via `-e` and never baked into the image (§13).
- **Sandbox boundary.** The headless shim owns the sandbox: each phase runs inside the Docker container; per-step retries and per-step cost caps are enforced by the shim, not by Claude Code's permission model (§14 con-Option-1 analysis).
- **Skill-improver guardrails (§11.3).** Non-negotiable in v1:
  1. `python scripts/lint_skills.py` MUST pass before the improver opens its PR.
  2. The improver's PR is **always opened as a draft** and is **never auto-merged**.
  3. The improver MAY only modify files under `skills/<implicated-skill>/`. Anything wider escalates to a human.
  4. Skill-improvement PRs traverse the same CI gates (lint + LLM eval) as any human PR.
  5. `implicated_skill: null` → workflow posts a justification reply and exits. No edit, no PR.
  6. `confidence: low` → improver does not run; reviewer is asked to re-run with `--force`.
  7. The evaluator will need to treat the PR comment as untrusted input.

## Test Plan

From §16 Testing Strategy and §19 Verification.

**Layered tests:**

1. **Skill linter** — existing `scripts/lint_skills.py` covers SKILL.md format/structure for all new skills.
2. **Per-skill behavior tests** — Python tests under `tests/` exercise rule fixtures (existing pattern).
3. **Harness end-to-end eval** — `fixtures/demo-unemployment.yaml` → `strata-harness build --workdir tmp --unattended`. Assert: app dir exists; `make lint` exits 0; `make test` exits 0; HTTP smoke probe on `/<model_kebab>s` returns 200. Wired into CI and runs only on merges to Main to prevent runaway cost with building a demo app repeatedly on commits or PR changes.
4. **Manual visual walkthrough** — gated step. CC plugin + Claude-in-Chrome flow.

**End-to-end verification scenarios:**

- `python scripts/lint_skills.py` — all skills lint clean.
- `npm test` (shim) — orchestrator, subagent loop, phase IO, and the §10.3 in-process hook parity (assert the right reference files get prepended for matching paths).
- CLI run: `strata-harness build --input fixtures/demo-unemployment.yaml --workdir /tmp/e2e --unattended` → `make lint && make test` both pass and `curl localhost:3000/unemployment_application_forms` returns 200 after `bin/dev`.
- CC plugin run: `/strata-build-demo` against a free-form prompt; gates at spec/plan/final fire; during build, verify the PreToolUse hook fires on the first write under `app/views/` (a `<system-reminder>` prepending `references/design-patterns.md` is visible).
- **Parity check:** both runtimes produce identical `demo.yaml` and identical generated app for the same input.
- **Skill-improvement happy path:** post a synthetic reviewer comment on a fixture PR labeled `harness-generated` pointing at an `app/views/` file. Confirm:
  1. `feedback-to-harness.yml` in the generated repo triggers.
  2. `repository_dispatch` is sent to `strata-agent-harness`.
  3. `skill-improve.yml` in the harness repo triggers.
  4. Evaluator returns correct `implicated_skill`.
  5. Improver opens a draft PR modifying only files under the implicated skill's directory; the new PR passes lint + LLM eval.

## Deployment and Rollout

Two install surfaces, both ship the same skill/hook content from the `strata-agent-harness` repo:

- **Developer machines:** install the Claude Code plugin (`.claude-plugin/plugin.json`); skills auto-load on session start. Per-developer permissions live in `.claude/settings.local.json` (unchanged); the new `PreToolUse` hook is registered in `.claude/settings.json` and ships with the plugin. Non-Claude-Code agents (e.g., Cursor) use the manual installation files described in §5.
- **CI / cloud:** consume the Docker image, published on tag to `ghcr.io/navapbc/strata-harness:<tag>`. Image is Ruby + Rails + Node + nava-platform + preinstalled Strata SDK;

```sh
docker run --rm \
  -v $PWD/workdir:/work \
  -e ANTHROPIC_API_KEY \
  ghcr.io/navapbc/strata-harness:latest \
  build --input /work/demo.yaml --unattended --workdir /work
```

The harness's responsibility ends at a working app in a workdir. The runner (a GitHub Action, an Anthropic Managed Agent, a Slackbot, or any pluggable surface) owns `git push` and PR-open.

**Initial rollout.** Ship v1 behind no flags. Usage is gated by who installs the plugin and who runs the workflow. Open the skill-improvement workflow on a single fixture repo first; widen to all `harness-generated`-labeled PRs once the evaluator has been verified against a representative sample of synthetic reviewer comments and the improver's draft PRs lint clean for two consecutive weeks.

## Rollback Plan

The harness owns no persistent state — every artifact is a file in `<workdir>` and every generated app is its own per-demo Git repo. Rollback paths:

- **A bad generated app:** close the runner's PR; delete the branch. The next harness run is independent.
- **A bad harness release:** pin the Claude Code plugin to the previous version on developer machines (re-install from the previous Git tag of `strata-agent-harness`); pin the workflow to a previous Docker tag (`ghcr.io/navapbc/strata-harness:<previous-tag>`). No data migration is involved.
- **A bad skill-improvement PR:** the PR is opened as a draft and never auto-merged (§11.3), so "rollback" = decline to mark ready / `git revert` the merge if it has already shipped.

Alerts to watch during rollout: GitHub Actions failure rate on `skill-improve.yml`, lint failure rate on the improver's draft PRs, and the eval pass-rate trend on harness-generated PRs.

## Monitoring and Logging

No central observability stack in v1 — three on-disk and in-platform sources only:

- **Per-phase transcripts.** `<workdir>/.strata-harness/build/transcripts/<phase>.log` — captured for every sub-agent, surfaced for debugging without rolling up into the parent context (§8).
- **Structured telemetry.** `skill_invocations:` block in `LEARNINGS.md` (§11.4) records every produced file path with the owning skill + version. This is both a debugging aid and the routing key for the skill-improvement loop.
- **CI workflow logs.** GitHub Actions retains `skill-improve.yml` run logs, including the evaluator's verdicts and the improver's lint output.

Surfacing: developers read transcripts in-IDE; engineers grep `LEARNINGS.md` in generated repos; the platform team watches the Actions tab for evaluator/improver health.

## Metrics

- **Time-to-demo.** Captured per build by `strata-compound-learnings` (§12). The headline number — drives the v1 goal of fixing the demo cadence.
- **Skill-improvement PR merge-rate.** What fraction of the improver's draft PRs get merged. Low merge-rate is a signal that the evaluator's precision is poor or the improver is producing low-quality edits — either way, an actionable feedback signal on the loop itself (§11).

## Long-term Support

Owner: the platform/skills team that ships `strata-agent-harness`. The harness is a thin layer over existing Strata SDK skills + the `obra/superpowers` methodology layer — most of the ongoing maintenance burden lives in the *skills*, not in the harness orchestration.
