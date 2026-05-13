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
| `LEARNINGS.md` | post-run | Compound-learnings entry (CE-inspired) |

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

## 10. Compound-Learnings Skill (CE-inspired, our own)

A `strata-compound-learnings` skill runs after `verify`. Its job: emit one `LEARNINGS.md` entry per build noting:

- What in the spec turned out to be wrong / changed during build
- Which validation patterns surprised the engineer
- Any SDK gem behavior that contradicted `references/*`
- The actual time-to-demo (telemetry)

`LEARNINGS.md` lives in the **generated repo** (per-demo). A future v2 aggregator skill (out of scope here) will mine these across many demos.

This is much smaller than CE's `/ce-compound` — one file, one append, no agent fan-out. Adopt the idea, not the apparatus.

## 11. Cloud Trigger + Sandbox Model

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

## 12. Option 1 Fallback — Pros & Cons (Revisit Later If Option 3 Is Too Expensive)

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

## 13. Repository / Plugin Layout

The current repo (`bao-nguyen-agent-skills`) is renamed or hosts the harness alongside the existing skills:

```
bao-nguyen-agent-skills/  (or strata-harness/)
├── .claude-plugin/
│   ├── plugin.json                      # CC plugin manifest, peer-depends on superpowers
│   └── ...
├── skills/                              # existing + new skills
│   ├── build-strata-rails-app/
│   ├── build-strata-sdk-model/
│   ├── build-strata-app-form-views/
│   ├── strata-harness-orchestrator/     # NEW — the dispatcher skill
│   ├── strata-harness-intent/           # NEW — phase 1
│   ├── strata-harness-spec/             # NEW — phase 2
│   ├── strata-harness-plan/             # NEW — phase 3
│   ├── strata-harness-verify/           # NEW — phase 5 (build phase reuses existing skills)
│   └── strata-compound-learnings/       # NEW — post-run
├── shim/                                # NEW — headless CLI
│   ├── src/
│   │   ├── cli.ts
│   │   ├── orchestrator.ts
│   │   ├── phases/{intent,spec,plan,build,verify}.ts
│   │   ├── subagent.ts                  # Anthropic SDK loop
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

## 14. Testing Strategy

1. **Skill linter** (already exists) covers SKILL.md format/structure for all new skills.
2. **Per-skill behavior tests** — Python tests under `tests/` exercise rule fixtures (existing pattern).
3. **Harness end-to-end eval** — given `fixtures/demo-unemployment.yaml`, run `strata-harness build --workdir tmp --unattended`. Assert: app directory exists, `make lint` exits 0, `make test` exits 0, an HTTP smoke probe on the generated app returns 200 on `/<model_kebab>s`. Wired into CI.
4. **Variance/regression tracking** — use the existing `skill-creator:skill-creator` evals infrastructure to track time-to-demo and pass-rate across runs.
5. **Manual visual walkthrough** — gate. CC plugin + Claude-in-Chrome flow (existing convention).

## 15. v1 Cut Recap

In scope:
- Orchestrator skill + intent + spec + plan + verify skills (5 new skills).
- The headless CLI shim + Dockerfile.
- `demo.yaml` JSON Schema.
- `strata-compound-learnings` skill.
- End-to-end eval against an unemployment fixture.

Out of scope (v2+):
- Case views skill, BusinessProcess DSL skill, Task subclass skill, end-to-end event wiring.
- Deploy / auth / seeds.
- Cross-demo aggregator skill.
- GitHub webhook trigger.
- Non-Rails templates.

## 16. Critical Files To Modify / Create

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
- `shim/src/cli.ts` and supporting files
- `schemas/demo.yaml.json`
- `docker/Dockerfile`
- `.claude-plugin/plugin.json`
- `docs/superpowers/specs/2026-05-13-agent-harness-design.md` (this file)

## 17. Verification

After implementation:

1. `python scripts/lint_skills.py` — all skills lint clean.
2. `npm test` (shim) — unit tests for orchestrator, subagent loop, phase IO.
3. End-to-end: `strata-harness build --input fixtures/demo-unemployment.yaml --workdir /tmp/e2e --unattended` produces a Rails app where `make lint && make test` both pass, and `curl localhost:3000/unemployment_application_forms` returns 200 after `bin/dev`.
4. In Claude Code: `/strata-build-demo` runs the same flow interactively against a free-form prompt and gates at spec/plan/final.
5. Both runtimes produce identical `demo.yaml` and identical generated app for the same input.

## 18. Open Questions (Recommended Defaults — Confirm On Review)

1. **Per-demo repo strategy.** Default: each demo is its own Git repo, initialized by the harness in `<workdir>`. The runner decides where to push. Alternative: a designated "strata-demos" monorepo with a branch per demo.
2. **Cloud runner choice for v1.** Default: GitHub Actions (we already use it). Alternative: Anthropic Managed Agents when available.
3. **`demo.yaml` ergonomics.** v1 schema mirrors the SDK generator surface 1:1, which is verbose. Default: ship the verbose form, add a "presets" mechanism in v2 (e.g. `app_type: unemployment` auto-fills 80% of attrs).
4. **Compound-learnings location.** Default: `LEARNINGS.md` in the *generated* repo. Alternative: a central `strata-harness-learnings` repo. Default chosen because it's runtime-agnostic and survives if the central repo is later split.
