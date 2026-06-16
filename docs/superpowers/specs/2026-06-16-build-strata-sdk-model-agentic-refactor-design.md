# Build Strata SDK Model — Agentic Refactor — Design

**Date:** 2026-06-16
**Status:** Draft for review
**Owner:** baonguyen@navapbc.com

## Problem

`skills/build-strata-sdk-model/SKILL.md` is a 494-line linear, single-agent workflow (10 steps). One agent, in one context, does everything: locate the Rails app, read the Strata SDK gem, ask the user what to build, propose a starter attribute set (step 4d), propose validations (step 4e), generate, TDD-strengthen, and verify. Three problems follow:

- **No separation of concerns.** Attribute *suggestion*, *type/standards auditing*, and *verification* are interleaved in one agent's head with no independent check. A wrong type the agent proposes is the same agent that "verifies" it — there is no adversarial review.
- **The orchestrating context carries everything** — raw gem source, generator output, the full reasoning chain — so it grows large and the reasoning is hard to audit.
- **It bumps the 500-line body cap.** At 494 lines there is no room to add structure; the linter (`scripts/lint_skills.py`) caps the `SKILL.md` body at 500 lines.

We want to refactor this skill into a **segmented multi-agent workflow** orchestrated through the `Workflow` tool, with a shared temp spec file as the artifact passed between agents, two human-in-the-loop checkpoints, and an adversarial audit→resolve check-and-balance before any model is built.

## Goals

- Decompose the work into six single-purpose agents (discovery, suggestion, audit, resolution, implementation, review), each with a clear input/output contract.
- Introduce a **temp model-spec file** as the single shared artifact that every agent reads and that records each attribute's provenance and state.
- Add an **adversarial check**: one agent flags attribute issues; a second independently re-checks each flag before any fix is applied.
- Preserve the two human checkpoints from the original concept: the user reviews suggested attributes, and the user confirms the revised model before implementation.
- Keep the SDK-reading rigor of the current skill (read the gem source as authoritative) but move it out of the orchestrator's context.
- Slim `SKILL.md` to a lean orchestration script well under the 500-line cap, with agent logic in editable reference files.

## Non-goals

- Controllers, views, routes, policies, Pundit — out of scope, as in the current skill (surfaced in the plan, not built).
- More than one model per invocation.
- Parallel agent fan-out — the pipeline is inherently sequential; no stage benefits from parallelism.
- Behavioral evaluation of the generated model beyond `make lint` + `make test`.
- Replacing the repo's TDD discipline — every change on top of generator output remains test-first.

## Decisions locked in brainstorming

| # | Decision | Choice |
|---|----------|--------|
| 1 | Spec-file lifecycle | **Spec → becomes the plan.** The temp spec drives refinement; on Checkpoint-2 confirmation the implementation agent converts it into the committed `docs/plans/<date>-<model>.md` plan, then the temp file is deleted. |
| 2 | How SDK knowledge reaches agents | **Dedicated discovery agent.** A first subagent reads the gem and returns a structured SDK-facts blob; the orchestrator stores it in the spec and feeds it to later agents. Gem-reading never enters the orchestrator's context. |
| 3 | Review agent authority | **Autonomous fix loop**, constrained to stay test-first (failing spec → fix → re-run suite). Behavior-altering changes are flagged in the report, not silently applied. |
| 4 | Orchestration mechanism | **`Workflow`-driven (Approach 2).** The skill is the orchestrator; `Workflow` runs the agent segments. |
| 5 | Handling checkpoints under Workflow | **Segment the workflow at each checkpoint.** A `Workflow` run cannot pause for input, so the pipeline is split into four runs; the orchestrator handles the human seams between them. |
| 6 | Spec scope | **Attribute/type-centric.** Validations and variant lifecycle are deferred to the implementation agent (derived from existing reference tables) and surfaced in the committed plan, not gated by a checkpoint. |
| 7 | Audit-agent reference name | Fresh name **`attribute-audit.md`** (the agent is the **Audit agent**) — avoids collision with the old `verification.md`'s meaning. |
| 8 | Workflow scripts | Bundled **`.js` files** in `references/workflows/`, read by the orchestrator and passed to `Workflow` inline via the `script` param with `args`. |

## Architecture

### Pipeline shape

The agent that invokes the skill is the **orchestrator**. It owns all user interaction, is the only writer of the temp spec file around checkpoint boundaries, and drives four sequential `Workflow` runs. Subagents inside each run are pure *read-spec → return-findings* workers and never talk to the user.

```
ORCHESTRATOR (skill)                          WORKFLOW RUNS
─────────────────────────────────────────────────────────────────
                                          ┌─ Run 1: DISCOVERY ─────────┐
(start) ──────────────────────────────────▶│ discovery agent:          │
                                          │  locate Rails app, verify  │
                                          │  Ruby, detect SDK, deep-    │
                                          │  read gem → SDK facts blob  │
        ◀─────────────────────────────────└────────────────────────────┘
ask SDK-informed questions
(name, kind, app-type, purpose,
 any attrs in mind)
write temp spec ───────────────────────────┌─ Run 2: SUGGEST ───────────┐
                                          │ suggestion agent: propose  │
                                          │  missing attrs for this    │
                                          │  app type → typed/primitive│
        ◀─────────────────────────────────└────────────────────────────┘
★ CHECKPOINT 1: show suggestions,
  user adds/disregards → update spec
                                          ┌─ Run 3: AUDIT → RESOLVE ───┐
                                          │ audit agent: flag wrong     │
                                          │  types / non-standard attrs │
                                          │       │                     │
                                          │ resolution agent: re-check  │
                                          │  each flag (adversarial),   │
                                          │  apply confirmed fixes →    │
                                          │  revised attrs + changelog  │
        ◀─────────────────────────────────└────────────────────────────┘
write revised attrs to spec
★ CHECKPOINT 2: show revised model,
  user confirms
                                          ┌─ Run 4: IMPLEMENT → REVIEW ┐
                                          │ implementation agent:       │
                                          │  spec→committed plan, run   │
                                          │  generator, TDD-strengthen, │
                                          │  make lint + make test      │
                                          │       │                     │
                                          │ review agent (autonomous    │
                                          │  fix loop): review diff,    │
                                          │  fix issues TEST-FIRST,     │
                                          │  re-run suite until clean   │
        ◀─────────────────────────────────└────────────────────────────┘
remove temp spec, final report
```

- **Four Workflow runs, split at the two checkpoints.** Discovery is its own run (decision 2). Audit→resolve are pipelined in Run 3 (resolution adversarially re-checks the audit's flags before any fix). Implement→review are pipelined in Run 4.
- **Subagents never ask the user anything.** Suggestion returns proposals; the orchestrator runs Checkpoint 1. Resolution returns revised attrs + a changelog; the orchestrator persists them and runs Checkpoint 2.
- **The orchestrator's context stays lean** — it never reads the gem and never holds raw generator output; it holds the spec, the structured agent returns, and the user's choices.

### The temp spec file

**Location:** `<RAILS_DIR>/tmp/strata-model-spec-<model-kebab>.md` (Rails gitignores `tmp/`).
**Lifecycle:** created by the orchestrator after the discovery run + initial questions; extended section-by-section as the pipeline advances; converted to the committed plan by the implementation agent on Checkpoint-2 confirmation; deleted after a successful implementation run.

**Structure:**

```markdown
---
model_name: FreeSchoolLunchApplicationForm
model_kind: application_form        # plain | application_form | case | business_process | task
app_type: free-school-lunch           # only for application_form
purpose: "One sentence from the user."
rails_dir: apps/benefits
status: draft                         # draft → suggested → audited → resolved → confirmed
---

## SDK facts            ← written by discovery agent (Run 1)
- sdk_present: true
- gem_path: /path/to/strata
- generator: `bin/rails generate strata:application_form FreeSchoolLunch <attrs>` (flags verified)
- base_class: Strata::ApplicationForm
- base_attributes (do NOT propose): user_id:uuid, status:integer, submitted_at:datetime
- type_catalog: name, address, tax_id, memorable_date, money, ssn, year_quarter, ...
- base_class_summary: status enum in_progress/submitted; submit_application flow; events ...

## Attributes          ← the evolving heart of the spec
| name | type | source | status | note |
|------|------|--------|--------|------|
| name | name | user | accepted | |
| household_size | integer | suggested | accepted | needs-eligibility |
| annual_income | string→money | audited | flagged→resolved | wrong type, fixed |

# source:  user | suggested | base
# status:  proposed | accepted | rejected | flagged | resolved

## Audit flags          ← written from audit agent (Run 3 stage 1)
- annual_income: declared `string`, should be `money` (severity: high)

## Resolution changelog ← written from resolution agent (Run 3 stage 2)
- annual_income → money. Flag CONFIRMED. (auditor was right)
- household_size flag REJECTED as false positive: integer is correct for a count.
```

- **The attributes table is the contract.** Every agent reads/extends it; `source` + `status` make each attribute's provenance and state auditable across the pipeline.
- **Agents return structured data; the orchestrator owns spec writes around checkpoints.** Within Run 3, the audit agent's flags feed resolution as a pipeline stage; resolution returns the revised attribute set + changelog, and the orchestrator persists it after the run. One writer per checkpoint boundary; no mid-run races.
- **Validations and lifecycle are not in the spec** (decision 6). The implementation agent derives default validations (from the current 4e table, now a reference) and variant lifecycle facts when it writes the committed plan.

### Per-agent contracts

Each agent runs inside a `Workflow` run. The first four use schema-validated structured output so the orchestrator gets clean data. The last two do work and return a prose report. All use the `general-purpose` agent type (they need `Bash`/`Read`/`Edit`/`Write`); each `agent()` prompt directs the agent to read its own reference file plus the spec.

| # | Agent | Run | Reads | Returns (structured unless noted) | Write authority |
|---|-------|-----|-------|-----------------------------------|-----------------|
| 1 | **Discovery** | 1 | cwd/monorepo, the gem source | `{rails_dir, ruby_ok, sdk_present, gem_path, per_variant:{generator_cmd, verified_flags, produces, base_class_summary, base_attrs}, type_catalog[]}` | none (read-only) |
| 2 | **Suggestion** | 2 | spec (model def + SDK facts) | `proposals[]: {name, type, typed:bool, rationale}` — missing attrs that matter for this app type | none (user picks first) |
| 3 | **Audit** | 3a | spec (full attr list) + SDK facts | `flags[]: {attr, issue, severity, suggested_fix}` — wrong type, dup of a base attr, non-standard | none (returns to resolution) |
| 4 | **Resolution** | 3b | spec + audit flags + SDK facts | `{revised_attrs[], changelog[]: {attr, action, flag_verdict: confirmed\|rejected, why}}` | none (orchestrator persists) |
| 5 | **Implementation** | 4a | confirmed spec + SDK facts | report (prose) | **writes:** plan, generator output, model, specs, migrations; deletes temp spec |
| 6 | **Review** | 4b | the diff + spec + plan | report: findings + fixes applied | **writes:** test-first fixes; re-runs suite |

Behavioral specifics:

- **Discovery** absorbs current steps 1–3 *and* `ruby-version-check`. It is the one agent allowed to wrestle the environment (locate the app in a monorepo, `bundle show strata`, read generators / USAGE / `*_generator.rb` / base classes / docs). Returns the compact facts blob — nothing raw. Trusts the gem source over any external memory (USAGE files may be stale; the generator source is authoritative — e.g. the BP flag is hyphenated `--application-form`, not the underscored form in USAGE).
- **Suggestion** is seeded by `app_type`. Example — *free-school-lunch* → household size, number of children in the household, annual/monthly income, categorical eligibility (SNAP/TANF), school + district, foster/migrant/homeless flags — each mapped to a Strata type or flagged as a primitive. It **must not** propose base attributes (`user_id`, `status`, `submitted_at`).
- **Audit is independent of suggestion.** It checks each attribute against the SDK type catalog and standards: is the type valid? Is it the *right* type (e.g. `birth_date` → `memorable_date` not `string`; income → `money`; SSN → `ssn`)? Does it duplicate a base attribute? Each issue becomes a flag with a severity and a suggested fix.
- **Resolution is adversarial** — it does not trust the auditor. For each flag it renders `confirmed` or `rejected` with a reason, and only confirmed flags produce changes. This is the check-and-balance. It returns the revised attribute set and a changelog (including rejected false positives).
- **Implementation** is the only agent that runs generators and TDD (current steps 6–9). It writes the committed plan from the confirmed spec first (per `writing-plans`), then generates (the variant-specific generator command verified by discovery), then strengthens behavior test-first (per `test-driven-development`), then runs `make lint` + `make test` green, then deletes the temp spec. It carries the old `verification.md` completion gate (run both, read full output, no paraphrasing prior runs).
- **Review** runs the autonomous fix loop (decision 3) but stays test-first per the repo's hard rule: failing spec → fix → re-run `make lint` + `make test`, loop until clean, then report. It may invoke the repo's existing `code-review` skill for the review pass. It auto-applies correctness/lint/test fixes it can justify; anything that would change the model's intended public behavior is flagged in the report rather than silently changed.

### Workflow invocation mechanics

- The orchestrator **reads a bundled `run-N.js`** from the skill's `references/workflows/` directory and passes its contents to `Workflow` via the `script` param, with `args: {spec_path, refs_dir, rails_dir, ...}`. Scripts read `args` rather than hard-coding values — the same script serves any model.
- Each `agent()` prompt inside a script directs the agent to **read its own reference file** (`<refs_dir>/agents/<name>.md`) plus the spec, then return its schema. Agent logic lives in editable markdown, not buried in JS.
- A skill's instructions invoking `Workflow` is a legitimate opt-in path for the tool (the user invoked a skill whose instructions call `Workflow`).
- Each script's structured-output schema (for the first four agents) is defined inline in the script as a JSON Schema and passed to `agent()` via the `schema` option, so returns are validated at the tool layer.

## Files added or modified

```
skills/build-strata-sdk-model/
├── SKILL.md                          ← slims to the orchestration script:
│                                       overview, pipeline diagram, the 4 Workflow
│                                       invocations + 2 checkpoints, trimmed pitfalls
├── references/
│   ├── model-spec-schema.md          ← NEW: the temp-spec format
│   ├── agents/
│   │   ├── discovery.md              ← NEW: absorbs steps 1–3 + ruby-version-check
│   │   ├── suggestion.md             ← NEW: absorbs the 4d starter-set + app-type tables
│   │   ├── attribute-audit.md        ← NEW: type/standards checks (the Audit agent)
│   │   ├── resolution.md             ← NEW: adversarial flag re-check + fix rules
│   │   ├── implementation.md         ← NEW: absorbs steps 6–9 (generator-per-kind, TDD loop, lint/test gate)
│   │   └── review.md                 ← NEW: review rubric + autonomous test-first fix loop
│   ├── workflows/
│   │   ├── run-1-discovery.js        ← the 4 Workflow segment scripts
│   │   ├── run-2-suggest.js
│   │   ├── run-3-audit-resolve.js
│   │   └── run-4-implement-review.js
│   ├── test-driven-development.md    ← KEPT (symlink) — cited by implementation.md & review.md
│   ├── writing-plans.md              ← KEPT (symlink) — cited by implementation.md
│   └── ruby-version-check.md         ← KEPT (symlink) — cited by discovery.md
```

| Path | Change | Purpose |
|------|--------|---------|
| `SKILL.md` | rewritten | Lean orchestrator: pipeline, 4 `Workflow` invocations, 2 checkpoints, trimmed pitfalls. Under 500 lines. |
| `references/model-spec-schema.md` | added | Authoritative temp-spec format; cited by every agent reference. |
| `references/agents/discovery.md` | added | Discovery-agent instructions (steps 1–3 + ruby check). |
| `references/agents/suggestion.md` | added | Suggestion-agent instructions (4d starter-set + app-type tables). |
| `references/agents/attribute-audit.md` | added | Audit-agent instructions. |
| `references/agents/resolution.md` | added | Resolution-agent instructions (adversarial re-check + fix rules). |
| `references/agents/implementation.md` | added | Implementation-agent instructions (steps 6–9 + completion gate). |
| `references/agents/review.md` | added | Review-agent instructions (autonomous test-first fix loop). |
| `references/workflows/run-1-discovery.js` | added | Run-1 script. |
| `references/workflows/run-2-suggest.js` | added | Run-2 script. |
| `references/workflows/run-3-audit-resolve.js` | added | Run-3 script (audit → resolve pipeline). |
| `references/workflows/run-4-implement-review.js` | added | Run-4 script (implement → review pipeline). |
| `references/verification.md` (symlink) | **removed** | Its content moves into `implementation.md` (completion gate) and `review.md` (loop exit). |

## Orchestrator responsibilities (the human seams)

The `SKILL.md` body defines, in order:

1. **Run 1 (discovery)** → store the returned SDK-facts blob.
2. **Initial questions** — present model kinds filtered by `sdk_present`; collect `model_name`, `model_kind`, `app_type` (if application form), `purpose`, and any attributes the user already has in mind. Write the temp spec.
3. **Run 2 (suggest)** → receive proposals.
4. **Checkpoint 1** — present proposals; the user adds/disregards each (or edits). Merge accepted attributes into the spec (`source: suggested`).
5. **Run 3 (audit → resolve)** → receive revised attrs + changelog. Write them to the spec.
6. **Checkpoint 2** — present the revised model (attributes + changelog); the user confirms or edits. On edit, re-run Run 3 against the edited spec.
7. **Run 4 (implement → review)** → receive the report.
8. **Finish** — confirm the temp spec was deleted; report files written, plan path, and `make lint` / `make test` status.

## Testing

- **Linter (`scripts/lint_skills.py`)** must pass on the rewritten skill: directory name unchanged, frontmatter intact, `name` matches directory, description ≤ 250 chars in third person, body ≤ 500 lines. The slimmed `SKILL.md` is the primary line-count win.
- **Reference existence** — every path referenced from `SKILL.md` and from each agent reference must exist (the repo's skill-quality dimension C). The new `agents/` and `workflows/` files plus the kept symlinks must all resolve.
- **Workflow-script sanity** — each `run-N.js` begins with a pure-literal `export const meta = {...}`, reads `args`, and avoids `Date.now()`/`Math.random()`/argless `new Date()` (forbidden in workflow scripts). Validated by loading each script in a dry-run.
- **End-to-end manual validation** against a real Strata app: run the full pipeline for an `application_form` (e.g. free-school-lunch) and confirm both checkpoints fire, the audit→resolve changelog records at least one confirmed and one rejected flag, and the implementation run lands `make lint` + `make test` green.

## Risks

- **Workflow can't pause** — already designed around (decision 5): the pipeline is segmented at each checkpoint, the orchestrator owns the seams. Risk is residual only if a future checkpoint is added inside a run; mitigation: any new checkpoint forces a new run boundary.
- **Four Workflow runs add orchestration overhead** for what are mostly single/double-agent segments. Accepted: the user chose the Workflow-driven mechanism; the segmentation is the minimum that preserves both checkpoints. If overhead proves unjustified for single-agent runs (discovery, suggest), those could fall back to a direct `Agent` dispatch without changing the contracts.
- **Bundled-script path resolution** — the orchestrator must resolve `references/workflows/run-N.js` relative to the installed skill directory before passing it inline. Mitigation: the SKILL.md instructs the orchestrator to read the script by skill-relative path; `args` carries `refs_dir` so agents resolve their own reference files.
- **Adversarial resolution over-rejecting** — a too-skeptical resolution agent could reject correct audit flags and let a wrong type through. Mitigation: Checkpoint 2 shows the full changelog (including rejections with reasons) so the user catches a bad rejection before implementation.
- **Autonomous review loop scope creep** — the loop could keep "fixing" indefinitely or alter intended behavior. Mitigation: it is constrained to correctness/lint/test fixes it can justify, stays test-first, and flags behavior-altering changes in the report rather than applying them; the loop exits when `make lint` + `make test` are green with no new findings.
- **SKILL.md still near the cap** — even slimmed, the orchestration body plus the pipeline diagram could approach 500 lines. Mitigation: keep agent detail in references; the body holds only orchestration flow and a trimmed pitfalls table.

## Out of scope / deferred

- Falling back to direct `Agent` dispatch for the single-agent runs (discovery, suggest) — noted as a possible simplification, not adopted now.
- Surfacing validations at Checkpoint 2 — deferred; validations are derived at implementation time and shown in the plan.
- A `--resume`-style restart of a partially-completed pipeline from the temp spec — the spec's `status` frontmatter field is designed to support this later, but resume logic is not specified here.
