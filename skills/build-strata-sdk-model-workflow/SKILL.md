---
name: build-strata-sdk-model-workflow
description: Orchestrates adding one Rails model (plain ActiveRecord, or a Strata SDK application form, case, business process, task) as a multi-agent Workflow pipeline with attribute audit and two checkpoints. Use only when opting into orchestration.
---

# Build Strata SDK Model (Workflow)

## Overview

Adds **one** model to an existing Rails app. Two families: a **plain** `ApplicationRecord` model, or a **Strata** variant inheriting from a Strata SDK base class (`Strata::ApplicationForm`, `Strata::Case`, `Strata::BusinessProcess`, `Strata::Task`).

This skill is an **orchestrator**. The agent that runs it owns all user interaction, owns the temp model-spec file, and drives four sequential `Workflow` runs. Each run dispatches subagents that read a self-contained reference file plus the shared spec and return structured data (Runs 1–3) or a prose report (Run 4). **Subagents never talk to the user** — every decision point is a checkpoint the orchestrator runs between `Workflow` calls.

```
Run 1 DISCOVERY ─▶ [questions + write spec] ─▶ Run 2 SUGGEST ─▶ ★ Checkpoint 1
   ─▶ Run 3 AUDIT→RESOLVE ─▶ ★ Checkpoint 2 ─▶ Run 4 IMPLEMENT→REVIEW ─▶ report
```

The temp spec is the single shared artifact — see [`references/model-spec-schema.md`](references/model-spec-schema.md). **Scope:** one model per invocation. Controllers, views, tasks, policies, and Pundit are out of scope and surfaced in the plan.

## Setup

Resolve two absolute paths once, up front:

- `<REFS>` — the absolute path to the `references/` directory next to this `SKILL.md`.
- `<START_DIR>` — the current working directory (where the search for the Rails app begins).

`<REFS>` is passed to **every** run as `args.refs_dir` so each subagent can read its own instructions and the spec.

To invoke a run: **read** the run's `.js` file under `<REFS>/workflows/`, then call `Workflow` with `script` set to its contents and `args` as shown. (A skill instructing `Workflow` is a valid opt-in for the tool.)

---

## Run 1 — Discovery

Read `references/workflows/run-1-discovery.js` and call:

```
Workflow({ script: <contents of run-1-discovery.js>,
           args: { refs_dir: "<REFS>", start_dir: "<START_DIR>" } })
```

Store the returned SDK facts (`rails_dir`, `ruby_ok`, `sdk_present`, `gem_path`, `variants`, `type_catalog`, `notes`). Then:

- `rails_dir` empty → no Rails app found. Stop and report (this skill must run from a Rails app or its parent monorepo).
- `notes` lists multiple candidate apps → confirm the right `rails_dir` with the user before continuing.
- `ruby_ok` false → tell the user the Ruby/bundler mismatch from `notes`; do not proceed until resolved.
- `sdk_present` false → tell the user the `strata` gem is not in the bundle; offer to (1) stop so they add `gem "strata"` and `bundle install`, or (2) continue with a **plain** model only. On (2), only `plain` is offered in the questions below.

Save `<RAILS_DIR> = rails_dir`.

---

## Questions

Ask the user, SDK-informed by Run 1. Lead each prompt with a one-line concept explanation; the user is not expected to be an SDK expert.

**Kind and name.** Offer the kinds available for `sdk_present`:

1. **Plain Rails model** (vanilla `ApplicationRecord`) — always available
2. **Strata application form** (`Strata::ApplicationForm`) — Strata only
3. **Strata case** (`Strata::Case`) — Strata only
4. **Strata business process** (`Strata::BusinessProcess`) — Strata only
5. **Strata task** (`Strata::Task`) — Strata only

Collect:

- `model_name` — PascalCase (e.g. `FreeSchoolLunchApplicationForm`, `UnemploymentCase`, `ReviewApplicationTask`).
- `model_kind` — `plain` | `application_form` | `case` | `business_process` | `task`.
- `app_type` — application forms only (e.g. unemployment, SNAP, Medicaid, free-school-lunch, …).
- `purpose` — one sentence.
- any attributes the user already has in mind.

For Strata variants, derive `<PROGRAM>` (the generator's first argument) by stripping the `ApplicationForm`/`Case`/`BusinessProcess`/`Task` suffix from `model_name` and PascalCasing the rest.

**Create the temp spec** at `<RAILS_DIR>/tmp/strata-model-spec-<model-kebab>.md` per [`references/model-spec-schema.md`](references/model-spec-schema.md):

- frontmatter (`status: draft`)
- the `## SDK facts` section, filled from Run 1 for this `model_kind`
- the initial `## Attributes` rows the user named (`source: user`, `status: accepted`)

Save `<SPEC>` = that path.

> Business processes have **no attributes** — capture steps and transitions (each step name + type + handler/task class, each `from`/event/`to` transition, the start trigger) in the spec's purpose/notes instead, and skip the suggestion/audit attribute work below. These cannot be inferred from the SDK; they must come from the user.

---

## Run 2 — Suggest

Read `references/workflows/run-2-suggest.js` and call:

```
Workflow({ script: <contents of run-2-suggest.js>,
           args: { refs_dir: "<REFS>", spec_path: "<SPEC>" } })
```

Receive `proposals` (each `{name, type, typed, rationale}`).

## ★ Checkpoint 1 — review suggestions

Present the proposals to the user. For each, the user **adds**, **disregards**, or **edits** (rename / change type). Append accepted attributes to the spec's `## Attributes` table with `source: suggested`, `status: accepted`. Set the spec `status: suggested`.

---

## Run 3 — Audit → Resolve

Read `references/workflows/run-3-audit-resolve.js` and call:

```
Workflow({ script: <contents of run-3-audit-resolve.js>,
           args: { refs_dir: "<REFS>", spec_path: "<SPEC>" } })
```

Receive `{ flags, resolution }`. Write into the spec:

- `## Audit flags` ← `flags`
- `## Resolution changelog` ← `resolution.changelog`
- replace `## Attributes` with `resolution.revised_attrs`

Set the spec `status: resolved`.

## ★ Checkpoint 2 — confirm the model

Present the revised `## Attributes` table **and** the changelog (including any flags the resolution agent rejected as false positives) to the user. The user confirms or edits.

- Edits → re-run **Run 3** against the edited spec, then re-present.
- Confirm → set the spec `status: confirmed` and continue.

---

## Run 4 — Implement → Review

Read `references/workflows/run-4-implement-review.js` and call:

```
Workflow({ script: <contents of run-4-implement-review.js>,
           args: { refs_dir: "<REFS>", spec_path: "<SPEC>", rails_dir: "<RAILS_DIR>" } })
```

Receive `{ implReport, reviewReport }`. The implementation agent writes the committed plan from the confirmed spec, runs the generator, strengthens the model test-first, lands `make lint` + `make test` green, and deletes the temp spec. The review agent runs an autonomous, test-first fix loop and flags any behavior-altering changes.

---

## Report

Confirm the temp spec was deleted, then tell the user:

> **Model ready.** `<model_kind>` model `<model_name>`. Files written: `app/models/<path>` (and `app/business_processes/<path>` for a business process), spec at `spec/models/<path>`. Plan at `docs/plans/<YYYY-MM-DD>-<model-kebab>.md`. `make lint` and `make test` both green. Out-of-scope items (controller, views, policy, tasks, UI) are listed in the plan but not built.

Surface any behavior-altering items the review agent flagged for the user to decide.

---

## Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| A subagent tried to ask the user a question | Subagents in a `Workflow` run cannot talk to the user | Move the interaction to the orchestrator at a checkpoint; the agent returns data, the orchestrator asks |
| `bundle show strata` empty | Gem not in Gemfile, or `bundle install` skipped | Add `gem "strata"`, run `bundle install`, restart |
| BP flag `--application_form` ignored | The BP `USAGE` shows underscored, but the generator's `class_option` is hyphenated `:"application-form"` | Use `--application-form` (and `--skip-application-form`, `--force-application-form`); trust the generator source over USAGE |
| Application form model extends `ApplicationRecord` | Generator output didn't apply the SDK base | Edit to extend `Strata::ApplicationForm` inside the TDD loop |
| `make test` green on first edit | Skipped the RED step | Revert, re-run the spec, watch it fail for the right reason, then re-implement |
| Migration conflict on rerun | Re-ran `strata:application_form` after a partial run | Roll back, delete the duplicate migration, re-run once |
| Spec asserts `submit_application` raises on post-submit edit | The SDK uses `errors.add(:base, ...)` + `throw :abort`, not an exception | Assert `update`/`save` returns `false` and `errors[:base]` contains "Cannot modify a submitted application" |
| Looked for a `Strata::BusinessProcess` migration | BP is not `ActiveRecord` — no migration is generated | Test the DSL (`steps`, transitions) and listener registration instead |
| Case spec adds `belongs_to :application_form` | The base declares `attribute :application_form_id, :uuid`; no association needed | Use `for_application_form(id)` or `Case.find_by(application_form_id: ...)` |
| Tried to generate a per-task migration | `strata_tasks` is a shared STI table | Skip the migration on subsequent `strata:task` runs; `--skip-migration-check` if the table exists |
| Generators failed because cwd is the monorepo root | Discovery's `rails_dir` was ignored | Run all generator commands from inside `<RAILS_DIR>` |

---

## Reference

- Model spec format: [`references/model-spec-schema.md`](references/model-spec-schema.md)
- Agents: [`references/agents/discovery.md`](references/agents/discovery.md), [`suggestion.md`](references/agents/suggestion.md), [`attribute-audit.md`](references/agents/attribute-audit.md), [`resolution.md`](references/agents/resolution.md), [`implementation.md`](references/agents/implementation.md), [`review.md`](references/agents/review.md)
- Workflow scripts: [`references/workflows/run-1-discovery.js`](references/workflows/run-1-discovery.js), [`run-2-suggest.js`](references/workflows/run-2-suggest.js), [`run-3-audit-resolve.js`](references/workflows/run-3-audit-resolve.js), [`run-4-implement-review.js`](references/workflows/run-4-implement-review.js)
- Ruby version: [`references/ruby-version-check.md`](references/ruby-version-check.md)
- TDD: [`references/test-driven-development.md`](references/test-driven-development.md)
- Plans: [`references/writing-plans.md`](references/writing-plans.md)
- Strata SDK source: read directly from `<gem_path>` (output of `bundle show strata`) — no curated reference is used.
- Strata SDK upstream: https://github.com/navapbc/strata-sdk-rails
