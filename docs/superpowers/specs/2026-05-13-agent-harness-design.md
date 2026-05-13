# Strata Demo Harness — Design Spec

Date: 2026-05-13
Status: Approved design; implementation plan to follow.

## 1. Context

Over the last month, three production-grade Strata skills were built (`build-strata-rails-app`, `build-strata-sdk-model`, `build-strata-app-form-views`). They are individually mature — TDD-mandatory, plan-mandatory, verify-mandatory, source-over-USAGE, references separation. They do not yet chain.

**Confirmed pain points** the harness must fix:

1. **Context overflow + no orchestration handoff.** Running skill A then skill B in one Claude Code session blows past the context window, and there is no structured way for B to start with A's outputs loaded.
2. **Verification unreliability.** Skills can claim done without actually running lint/test/walkthrough.
3. **Demo cadence too slow.** Going from "build me an unemployment demo" to a clickable app takes too many manual turns.
4. **No headless / cloud mode.** Skills work interactively but cannot run unattended in a sandbox, CI, or as a background agent.
5. **No closed feedback loop on skill quality.** Skills only improve via manual editing. When a reviewer comments on a harness-generated PR with a legitimate skill-quality signal, nothing routes that signal back into the skill content. Improvement is human-paced.

Prior architecture spec named the central constraint: *orchestrator must be a dispatcher (not a doer); a harness + sub-agent-driven development must exist first to prevent context overflow.* This spec implements that.

## 2. Goals (v1)

- Produce a working **member-side application-form demo** end-to-end from either a free-form prompt or a `demo.yaml` spec.
- Run in **two runtimes** sharing the same skill files: a Claude Code plugin (local IDE) and a headless Anthropic-SDK CLI shim (cloud).
- Use **configurable gates**: default = pause at spec, plan, final; `--unattended` = no in-process pauses (the harness exits at the end of `verify` with a status marker for the runner to surface).
- **Hard dependency on `obra/superpowers`** for the methodology layer (brainstorming, writing-plans, executing-plans, subagent-driven-development, TDD, verification-before-completion).
- Steal one idea from Compound Engineering: a `strata-compound-learnings` skill that codifies per-demo lessons; avoid CE's 51 named agents.

## 3. Non-Goals (v1)

- Case views, BusinessProcess DSL skill, Task subclass skill, end-to-end event wiring. **Deferred to v2.**
- Deploy / auth / seeded production-fidelity data. **Deferred to vX.**
- Cross-demo learning aggregator (org-wide insights mined from many demos). **Deferred.**
- Support for non-Rails Strata templates (Next.js, Python). **Out of scope until Strata supports them.**
- Opening PRs from the harness itself. The runner (CI / webhook / Slackbot) is responsible for taking the generated repo and pushing it / opening a PR.

## 4. Architecture — Linear Pipeline (Approach A)

Five discrete phases. Each phase reads files on disk and writes files on disk. Files-on-disk is the IPC layer — that is what makes the harness runtime-agnostic.

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  intent  │ → │   spec   │ → │   plan   │ → │  build   │ → │  verify  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
intent.md       demo.yaml      plan.md        build/        verification.md
                                              (commits)
```

Each phase is **one skill** (the orchestrator never does work directly). The orchestrator is a thin dispatcher that:

1. Reads the previous phase's artifact.
2. Decides whether to gate (config + flags).
3. Dispatches a fresh sub-agent for the next phase with that artifact loaded.
4. Writes the new artifact when the sub-agent completes.

The build phase is the exception — internally it dispatches one sub-agent **per Strata skill invocation** (rails-app, sdk-model, app-form-views), each with its own fresh context. This is how we beat context overflow.

## 5. Two Runtimes, One Set of Skills

```
                  shared content (npm package)
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

- **Shared content** ships as an **npm package** (`@navapbc/strata-harness`) per the existing distribution spec. The Claude plugin and the CLI shim both `require()` it.
- **Claude Code plugin** uses Claude Code's native sub-agent dispatch (Task tool) and the file-based artifacts.
- **Headless CLI shim** is a small Node/TypeScript binary that re-implements the same dispatch loop using the Anthropic SDK. It reads the same skill markdown, ships system prompts assembled from it, and writes the same artifact files.

The CLI shim is the **biggest single new piece of code** in v1. Estimated ~1.5–2k LOC of orchestration + sandbox glue.

## 6. The Canonical Artifact Contract

Files written under `<workdir>/.strata-harness/`:

| File | Owner phase | Purpose |
|---|---|---|
| `intent.md` | intent | Raw user prompt or normalized intent narrative |
| `demo.yaml` | spec | Canonical spec — the contract for all later phases |
| `plan.md` | plan | Ordered list of skill invocations + per-step success criteria |
| `build/transcripts/<phase>.log` | build | Per-sub-agent transcripts (for debugging) |
| `verification.md` | verify | Lint/test/walkthrough output + final disposition |
| `LEARNINGS.md` | post-run | Compound-learnings entry (CE-inspired) plus a structured `skill_invocations:` block mapping each generated file path → owning skill name + version. The skill-improvement loop (§11) reads this block to route reviewer comments back to the correct skill. |

`demo.yaml` v1 schema (mirrors the Strata SDK generator surface):

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

v2 will add `case`, `business_process`, and `tasks` top-level blocks.

The schema is **JSON-Schema-validated** at the start of every phase that reads it — both runtimes fail fast on a malformed `demo.yaml`.

## 7. Phase Definitions

**`intent`** — Run when input is a free-form prompt. Output: `intent.md` (a narrative the spec phase can read). If input is already a `demo.yaml`, this phase is skipped.

**`spec`** — Run the brainstorming-flavored Q&A from existing skills (`build-strata-sdk-model` Step 4 + `build-strata-app-form-views` Step 5) but **without invoking the build skills themselves**. Output: `demo.yaml`. **Gate point #1** (default; suppressed by `--unattended`): pause for user to confirm `demo.yaml`.

**`plan`** — Read `demo.yaml`, decide the ordered list of skill invocations and per-skill arguments. v1 ordering is fixed: `build-strata-rails-app` → `build-strata-sdk-model` → `build-strata-app-form-views`. Output: `plan.md`. **Gate point #2** (default; suppressed by `--unattended`): pause for user to confirm.

**`build`** — Run each step in `plan.md` as a fresh sub-agent. Each sub-agent invokes one existing Strata skill end-to-end in its own context with only the relevant slice of `demo.yaml` loaded. Sub-agent transcripts are persisted but their context is **not** rolled up into the parent. Output: a working Rails app + git commits in `<workdir>/<app_name>/`.

**`verify`** — Run `make lint`, `make test`, and a Claude-in-Chrome walkthrough (per `build-strata-app-form-views` Step 11). Output: `verification.md` + a pass/fail signal. **Gate point #3**:
- In CC plugin (interactive): blocking prompt asking the user to confirm before marking the run complete.
- In `--unattended`: not a blocking gate — the harness exits with `verify.passed` or `verify.failed` written into `verification.md`, and the runner is responsible for surfacing the result (e.g. opening a PR for human review).

## 8. Sub-Agent Isolation

- In the **CC plugin**: each phase dispatches a Claude Code Task with a curated prompt that loads only that phase's artifact (and the relevant SKILL.md). Token budget per phase capped; if exceeded, sub-agent compacts and continues.
- In the **headless shim**: each phase is an independent Anthropic API conversation. The shim assembles the system prompt from `prompts/phase-<n>.md` + the SKILL.md + the artifact, then runs a tool-use loop until the sub-agent emits the next artifact and exits.
- The build phase can dispatch sub-agents **in parallel** for independent skills (none in v1 — they're sequential — but v2 will parallelize model + views generation per-Strata-program if multiple programs are batched).

## 9. Configurable Gates

Three default gate points (spec, plan, final). Gate mechanics:

- **CC plugin (interactive):** blocking question to the user (uses `AskUserQuestion` if available, else inline prompt).
- **Headless shim (`--unattended`):** no in-process pauses. Spec and plan gates are suppressed entirely; the final "gate" is really an exit status — the harness writes `verify.passed` / `verify.failed` and the runner takes over.
- **Headless shim (default, no `--unattended`):** writes `<phase>.awaiting-review` and exits 0 with a known marker. Resume with `--resume` after editing the artifact.

`strata-harness build` flags:

| Flag | Effect |
|---|---|
| `--input <file-or-prompt>` | The hybrid input. If a `.yaml`, skips intent. If a string, runs intent first. |
| `--workdir <path>` | Where artifacts and the generated app live. Defaults to `./strata-demo-<timestamp>`. |
| `--unattended` | Suppresses spec and plan gates; final phase exits with a status marker for the runner. |
| `--resume` | Reads existing artifacts and continues from the next un-completed phase. |
| `--phase <name>` | Run only that phase. Used for re-running spec or plan after edits. |
| `--gates spec,plan,final` | Override the default gate set explicitly. |

## 10. Opinionated UX Context + Pre-Write Hooks

The Strata SDK is deliberately unopinionated about UI and navigation. That flexibility is correct for the SDK and wrong for an agentic harness: without an opinion the agent invents one per run, producing inconsistent, occasionally broken UX. Prior experimentation (vault note `2026-05-12 - Agent Skills NPM Install and Hooks Architecture.md`) landed on two findings that drive this section:

- **Markdown context packaged with the skill works.** When `build-strata-app-form-views` was given `references/design-patterns.md` + `references/ui-kit-components.md` describing USWDS conventions, SDK component inventory, and an opinionated multi-page flow model, output quality jumped sharply.
- **Hooks beat rules.** A prior attempt to load opinions via `.claude/rules/` failed — rules are passive context and did not improve adherence. Hooks fire actively at the right moment and reliably shape behavior. The unit that ships is **skill + hook + installer**, not skill alone.

This section makes both findings architectural.

### 10.1 Design-context packs as a convention

Every build-time skill that produces user-facing artifacts MUST ship at minimum:

- `skills/<skill>/references/design-patterns.md` — opinionated UX decisions the SDK declines to make (page granularity, progress indicators, error placement, navigation between tasks).
- `skills/<skill>/references/ui-kit-components.md` — the inventory of SDK / USWDS components the skill is allowed to use, with usage notes.

Today `build-strata-app-form-views` already has both. v1 adds minimal stubs for `build-strata-rails-app` and `build-strata-sdk-model` so the convention holds for the whole skill set, even where the content is shorter.

The skill linter (`scripts/lint_skills.py`) gains an optional check (warn, not fail, in v1) that any skill whose body mentions writing to `app/views`, `app/components`, or `app/javascript` carries both reference files.

### 10.2 Pre-write injection hook

A Claude Code `PreToolUse` hook (`hooks/inject-design-context.sh`, registered in `.claude/settings.json`) intercepts `Edit` and `Write` tool calls whose `file_path` matches any of:

- `**/app/views/**`
- `**/app/components/**`
- `**/app/javascript/**`
- `**/app/helpers/**`

When matched, the hook prepends the active skill's `references/design-patterns.md` and `references/ui-kit-components.md` to the next assistant turn's context (as a `<system-reminder>` block) before the tool call proceeds. The "active skill" is determined from the most recent `Skill` tool invocation in the transcript, or — when running headlessly — from the current phase's skill identifier.

The hook is intentionally a no-op when the active skill has no design-context pack, so it remains safe to enable globally.

### 10.3 Shim parity

The headless CLI shim re-implements the same gate in TypeScript. Before forwarding any tool-use block from the model that calls `Edit` or `Write` against a matching path, the shim looks up the active skill's `references/design-patterns.md` + `references/ui-kit-components.md` and prepends them to the next system message of the same conversation. The trigger is per-runtime, but **the content (markdown files) is identical** — that is the runtime-agnostic property the harness depends on.

### 10.4 Non-goals for v1

- A second `PostToolUse` lint hook that validates generated views against USWDS / a11y rules. **v2.**
- Generated `.claude/rules/` files. Explicitly rejected — see findings above.
- Per-component design tokens, theming, or design-system extraction. **vX.**

## 11. Skill Self-Improvement Loop

The compound-learnings skill (§12) captures per-demo descriptive notes. It does not change skill content. This section adds a prescriptive loop: a legitimate reviewer comment on a harness-generated PR becomes a focused edit to the implicated skill, opened as its own PR for human review.

```
PR (from harness) ──► reviewer comment ──► GH Action (skill-improve.yml) ──►
   strata-skill-comment-evaluator (legit? + which skill?) ──►
      strata-skill-improver (plan → edit → lint → PR against Strata Agent Harness)
```

### 11.1 Trigger

A new workflow `.github/workflows/skill-improve.yml` listens for `issue_comment.created` events on PRs labeled `harness-generated` (the runner applies this label when opening the original PR). On match, the workflow dispatches the headless shim in a Docker container with:

```
strata-harness improve-skill --pr <n> --comment <id> --unattended
```

The workflow has no other triggers — it does not run on push, on schedule, or on PR open.

### 11.2 Two new skills, two responsibilities

- **`strata-skill-comment-evaluator`** — an LLM-as-judge skill. Reads the PR comment, the file/line it anchors to, the diff context, and the `LEARNINGS.md` `skill_invocations:` block from the build that produced the PR. Returns a structured verdict:
  ```yaml
  legit: true | false
  reason: "<one-paragraph justification>"
  implicated_skill: build-strata-app-form-views   # or null
  confidence: high | medium | low
  ```
  Rubric (rejects): one-off design preference; out-of-scope feature request; cosmetic taste; comment about generated app code that the skill cannot influence. Rubric (accepts): a class of error the skill could have prevented; a misuse of an SDK affordance the skill should have known about; a UX violation of a pattern documented in the skill's `design-patterns.md`.

- **`strata-skill-improver`** — given an implicated skill and the legitimate comment, plans focused edits using `superpowers:writing-plans` + `superpowers:writing-skills`, applies them, runs `python scripts/lint_skills.py`, and opens a draft PR against `strata-agent-harness` titled `skill-improve: <skill> — <comment summary>` with the original PR + comment linked in the body.

### 11.3 Guardrails (non-negotiable in v1)

1. `python scripts/lint_skills.py` MUST pass before the improver opens its PR. Lint failure aborts.
2. The improver's PR is **opened as a draft** and is **never auto-merged**. Human review is required.
3. The improver MAY only modify files under `skills/<implicated-skill>/`. Touching other skills, shared infra, or scripts requires the human reviewer to take over manually.
4. Public-domain governance from the 2026-04-13 tech-spec discussion still applies — skill-improvement PRs traverse the same CI gates (lint + LLM eval) as any human PR.
5. If the evaluator returns `legit: false`, the workflow posts a short justification as a reply to the original comment and exits. No further action.
6. If the evaluator returns `confidence: low`, the improver does not run; the workflow posts the evaluator's analysis as a reply and waits for a human to re-run with `--force`.

### 11.4 Telemetry contract

The build phase MUST write a structured `skill_invocations:` block into `LEARNINGS.md` (already noted in the §6 artifact table). Shape:

```yaml
skill_invocations:
  - skill: build-strata-rails-app
    version: 0.4.1
    produced_files: ["Gemfile", "config/application.rb", ...]
  - skill: build-strata-sdk-model
    version: 0.3.0
    produced_files: ["app/models/unemployment_application_form.rb", ...]
  - skill: build-strata-app-form-views
    version: 0.5.2
    produced_files: ["app/views/unemployment_application_forms/**/*.erb", ...]
```

The evaluator uses this to deterministically map `comment.path` → `implicated_skill`.

### 11.5 Relationship to compound-learnings

| Aspect | `strata-compound-learnings` (§12) | `strata-skill-improver` (§11) |
|---|---|---|
| Output | `LEARNINGS.md` entry in the generated repo | A PR against `strata-agent-harness` |
| Tone | Descriptive (what happened) | Prescriptive (what to change) |
| Trigger | End of every harness run | A reviewer comment on a harness PR |
| Scope | The just-built demo | The skill content itself |

The two are complementary by design. Compound-learnings is the journal; the improver is the editor.

## 12. Compound-Learnings Skill (CE-inspired, our own)

A `strata-compound-learnings` skill runs after `verify`. Its job: emit one `LEARNINGS.md` entry per build noting:

- What in the spec turned out to be wrong / changed during build
- Which validation patterns surprised the engineer
- Any SDK gem behavior that contradicted `references/*`
- The actual time-to-demo (telemetry)

`LEARNINGS.md` lives in the **generated repo** (per-demo). A future v2 aggregator skill (out of scope here) will mine these across many demos.

This is much smaller than CE's `/ce-compound` — one file, one append, no agent fan-out. Adopt the idea, not the apparatus.

## 13. Cloud Trigger + Sandbox Model

v1 cloud invocation is **CLI-driven**, no webhook surface yet:

```sh
# From a CI runner / cron / future webhook:
docker run --rm \
  -v $PWD/workdir:/work \
  -e ANTHROPIC_API_KEY \
  ghcr.io/navapbc/strata-harness:latest \
  build --input /work/demo.yaml --unattended --workdir /work
```

The Docker image is a Ruby + Rails + Node + nava-platform + (preinstalled) Strata SDK image. ~600 MB. Builds in CI; published on tag.

**Output**: a fully-built Rails app in `/work/<app_name>/`. The runner is responsible for `git push`ing to a destination repo / opening a PR. v1 does **not** open PRs — the runner does that.

This keeps the harness's responsibility narrow (build a working app in a directory) and lets different cloud surfaces (GitHub Actions, an Anthropic Managed Agent, a Slackbot) decide their own destination logic.

## 14. Option 1 Fallback — Pros & Cons (Revisit Later If Option 3 Is Too Expensive)

**Option 1 = Claude Code plugin only; cloud runs `claude -p` in non-interactive mode with the same plugin loaded.** This was rejected in favor of Option 3 (CC plugin + headless SDK shim) but is documented here for a possible future revisit.

**Pros of Option 1:**

- **Build cost is roughly half.** We skip the ~1.5–2k LOC headless CLI shim and the Docker image entirely. The CC plugin we'd build anyway *is* the cloud artifact.
- **No second sub-agent dispatch implementation.** Claude Code handles sub-agent isolation natively; we get it free. In Option 3 the shim has to reimplement that loop.
- **One mental model for engineers.** "Whatever I see locally is what runs in cloud" — no divergence between runtimes.
- **Token cost can be lower** if Claude Code's prompt caching is more aggressive than our shim's.

**Cons of Option 1 (why we picked Option 3 instead):**

- **Claude Code is interactive-first.** Long-running `claude -p` sessions have rough edges around hangs, timeouts, and non-deterministic compaction. Ramp-style background work needs more control over the loop.
- **Cloud licensing/auth surface is messier.** Every cloud runner needs Claude Code installed and authenticated. The shim only needs an API key.
- **Sandboxing is whatever Claude Code allows.** With the shim we own the sandbox boundary — per-step Docker containers, per-step retries, per-step cost caps. Option 1 inherits Claude Code's permission model.
- **No native queueing / orchestration.** A cloud queue (build N demos overnight) is harder to bolt onto `claude -p` than onto a CLI we wrote.
- **Telemetry is harder.** We can instrument the shim's loop directly; with Claude Code we depend on what its logs expose.

**Concrete trigger to revisit Option 1:** if at the end of v1 the shim has cost more than 3 engineering weeks and the cloud demand is still hypothetical, collapse to Option 1, accept the cons, ship local-only with `claude -p` documented as the cloud path.

## 15. Repository / Plugin Layout

The production repo (`strata-agent-harness`) hosts the harness alongside the existing skills:

```
strata-agent-harness/
├── .claude/
│   ├── settings.json                    # NEW — registers PreToolUse hook (§10.2)
│   └── settings.local.json              # existing — per-developer permissions
├── .claude-plugin/
│   ├── plugin.json                      # CC plugin manifest, peer-depends on superpowers
│   └── ...
├── .github/workflows/
│   ├── lint-skills.yml                  # existing — lint + LLM eval on push/PR
│   └── skill-improve.yml                # NEW — issue_comment → strata-skill-improver (§11.1)
├── hooks/
│   └── inject-design-context.sh         # NEW — PreToolUse hook (§10.2)
├── skills/                              # existing + new skills
│   ├── build-strata-rails-app/
│   │   └── references/                  # gains design-patterns.md + ui-kit-components.md stubs (§10.1)
│   ├── build-strata-sdk-model/
│   │   └── references/                  # gains design-patterns.md + ui-kit-components.md stubs (§10.1)
│   ├── build-strata-app-form-views/     # already has both references
│   ├── strata-harness-orchestrator/     # NEW — the dispatcher skill
│   ├── strata-harness-intent/           # NEW — phase 1
│   ├── strata-harness-spec/             # NEW — phase 2
│   ├── strata-harness-plan/             # NEW — phase 3
│   ├── strata-harness-verify/           # NEW — phase 5 (build phase reuses existing skills)
│   ├── strata-compound-learnings/       # NEW — post-run
│   ├── strata-skill-comment-evaluator/  # NEW — §11.2
│   └── strata-skill-improver/           # NEW — §11.2
├── shim/                                # NEW — headless CLI
│   ├── src/
│   │   ├── cli.ts
│   │   ├── orchestrator.ts
│   │   ├── phases/{intent,spec,plan,build,verify,improve-skill}.ts
│   │   ├── subagent.ts                  # Anthropic SDK loop
│   │   ├── hooks.ts                     # NEW — runs §10.3 design-context injection
│   │   └── sandbox.ts                   # Docker glue
│   ├── package.json
│   └── tsconfig.json
├── schemas/
│   └── demo.yaml.json                   # JSON Schema for the canonical spec
├── docker/
│   ├── Dockerfile                       # Ruby+Rails+Node+nava-platform+Strata
│   └── entrypoint.sh
├── docs/superpowers/specs/
│   └── 2026-05-13-agent-harness-design.md  # this file
└── scripts/
    └── lint_skills.py                   # existing
```

## 16. Testing Strategy

1. **Skill linter** (already exists) covers SKILL.md format/structure for all new skills.
2. **Per-skill behavior tests** — Python tests under `tests/` exercise rule fixtures (existing pattern).
3. **Harness end-to-end eval** — given `fixtures/demo-unemployment.yaml`, run `strata-harness build --workdir tmp --unattended`. Assert: app directory exists, `make lint` exits 0, `make test` exits 0, an HTTP smoke probe on the generated app returns 200 on `/<model_kebab>s`. Wired into CI.
4. **Variance/regression tracking** — use the existing `skill-creator:skill-creator` evals infrastructure to track time-to-demo and pass-rate across runs.
5. **Manual visual walkthrough** — gate. CC plugin + Claude-in-Chrome flow (existing convention).

## 17. v1 Cut Recap

In scope:
- Orchestrator skill + intent + spec + plan + verify skills (5 new skills).
- The headless CLI shim + Dockerfile.
- `demo.yaml` JSON Schema.
- `strata-compound-learnings` skill.
- End-to-end eval against an unemployment fixture.
- **Pre-write design-context injection hook** (Claude Code `PreToolUse` + shim-side parity) and the design-context pack convention (`references/design-patterns.md` + `references/ui-kit-components.md`) on every build-time skill.
- **Skill self-improvement loop**: `strata-skill-comment-evaluator` + `strata-skill-improver` skills, plus `.github/workflows/skill-improve.yml`.

Out of scope (v2+):
- Case views skill, BusinessProcess DSL skill, Task subclass skill, end-to-end event wiring.
- Deploy / auth / seeds.
- Cross-demo aggregator skill.
- GitHub webhook trigger.
- Non-Rails templates.
- Post-write USWDS / a11y validation hook.
- Auto-merging skill-improvement PRs.
- Cross-skill or shared-infra edits from the improver (single-skill scope only in v1).
- Multi-skill comment routing (v1 picks the most directly implicated skill; v2 fans out).

## 18. Critical Files To Modify / Create

Existing — no changes in v1, but referenced:
- `skills/build-strata-rails-app/SKILL.md`
- `skills/build-strata-sdk-model/SKILL.md`
- `skills/build-strata-app-form-views/SKILL.md`
- `scripts/lint_skills.py`

New:
- `skills/strata-harness-orchestrator/SKILL.md`
- `skills/strata-harness-intent/SKILL.md`
- `skills/strata-harness-spec/SKILL.md`
- `skills/strata-harness-plan/SKILL.md`
- `skills/strata-harness-verify/SKILL.md`
- `skills/strata-compound-learnings/SKILL.md`
- `skills/strata-skill-comment-evaluator/SKILL.md`
- `skills/strata-skill-improver/SKILL.md`
- `skills/build-strata-rails-app/references/design-patterns.md` + `references/ui-kit-components.md` (stubs to satisfy the §10 convention)
- `skills/build-strata-sdk-model/references/design-patterns.md` + `references/ui-kit-components.md` (stubs)
- `hooks/inject-design-context.sh` (Claude Code `PreToolUse` hook)
- `.claude/settings.json` (registers the hook; `.claude/settings.local.json` already exists for per-developer permissions and is left alone)
- `shim/src/cli.ts` and supporting files (the shim implements §10.3 hook parity inline)
- `schemas/demo.yaml.json`
- `docker/Dockerfile`
- `.claude-plugin/plugin.json`
- `.github/workflows/skill-improve.yml`
- `docs/superpowers/specs/2026-05-13-agent-harness-design.md` (this file)

## 19. Verification

After implementation:

1. `python scripts/lint_skills.py` — all skills lint clean.
2. `npm test` (shim) — unit tests for orchestrator, subagent loop, phase IO, and the §10.3 in-process hook parity (assert the right reference files get prepended for matching paths).
3. End-to-end: `strata-harness build --input fixtures/demo-unemployment.yaml --workdir /tmp/e2e --unattended` produces a Rails app where `make lint && make test` both pass, and `curl localhost:3000/unemployment_application_forms` returns 200 after `bin/dev`.
4. In Claude Code: `/strata-build-demo` runs the same flow interactively against a free-form prompt and gates at spec/plan/final. During the build, verify the PreToolUse hook fires (a `<system-reminder>` prepending `references/design-patterns.md` is visible) on the first write under `app/views/`.
5. Both runtimes produce identical `demo.yaml` and identical generated app for the same input.
6. **Self-improvement loop end-to-end**: post a synthetic reviewer comment on a fixture PR labeled `harness-generated` pointing at an `app/views/` file. Confirm:
   a. `skill-improve.yml` triggers.
   b. `strata-skill-comment-evaluator` returns `legit: true` and `implicated_skill: build-strata-app-form-views`.
   c. `strata-skill-improver` opens a **draft** PR against `strata-agent-harness` that modifies only files under `skills/build-strata-app-form-views/`.
   d. The new PR passes `python scripts/lint_skills.py` and the LLM eval in CI.
7. **Negative-path verification**: post a comment that is cosmetic/out-of-scope. Confirm the evaluator returns `legit: false` and the workflow posts a reasoned reply without opening a PR.

## 20. Open Questions (Recommended Defaults — Confirm On Review)

1. **Per-demo repo strategy.** Default: each demo is its own Git repo, initialized by the harness in `<workdir>`. The runner decides where to push. Alternative: a designated "strata-demos" monorepo with a branch per demo.
2. **Cloud runner choice for v1.** Default: GitHub Actions (we already use it). Alternative: Anthropic Managed Agents when available.
3. **`demo.yaml` ergonomics.** v1 schema mirrors the SDK generator surface 1:1, which is verbose. Default: ship the verbose form, add a "presets" mechanism in v2 (e.g. `app_type: unemployment` auto-fills 80% of attrs).
4. **Compound-learnings location.** Default: `LEARNINGS.md` in the *generated* repo. Alternative: a central `strata-harness-learnings` repo. Default chosen because it's runtime-agnostic and survives if the central repo is later split.
5. **Hook portability across runtimes.** Claude Code hooks are CC-specific; the shim mirrors them in-process (§10.3). If a third runtime (e.g. Cursor) is added later, it must implement its own injection mechanism. Default: accept the per-runtime trigger duplication — the *content* (markdown reference files) stays shared and is the load-bearing part. Alternative: a tiny pure-text wrapper utility that the harness invokes via shell and that each runtime adapts to. Rejected for v1 as premature abstraction.
6. **Skill-improver scope creep.** A reviewer comment may legitimately implicate two skills (e.g. a model attribute *and* its view widget). Default v1: the improver picks the most directly implicated skill (highest `confidence` from the evaluator, tie-break by deeper-in-the-stack — model > views > app scaffold) and notes the secondary candidates in the PR body for human follow-up. Multi-skill edits are v2.
7. **Improver re-entry on rejected lint.** If `python scripts/lint_skills.py` fails after the improver's edit, default: abort with a comment back on the original PR explaining the failure and asking for human review. Alternative: one retry attempt with the lint output fed back into the planner. Default chosen to keep v1 deterministic; iterative self-repair is v2.
