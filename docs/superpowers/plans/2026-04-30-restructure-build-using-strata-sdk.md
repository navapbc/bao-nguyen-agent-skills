# Restructure build-using-strata-sdk Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `skills/build-using-strata-sdk/SKILL.md` so SDK clone + read happens before planning, planning is informed by SDK contents (generators, attribute types, form/architecture concepts), the plan is re-validated against the SDK after drafting, generators are always preferred for model + spec + template scaffolding, and redundancy with shared references (TDD, verification, writing-plans, ruby-version-check) is removed.

**Architecture:** Single-file rewrite of `skills/build-using-strata-sdk/SKILL.md`. Reorder steps: locate Rails dir → clone SDK → explore SDK (docs + generator inventory) → planning phase with SDK-informed clarifying questions → re-validate plan against SDK → ruby-version-check → install gem → generate model+specs+migration+views via SDK generators → TDD around generator output (update specs to assert real behavior, watch fail, edit generated code to pass) → verify → report. Replace inlined TDD/verification/plan-writing/ruby-check content with single-line pointers to existing references. Add SDK-driven clarifying-question prompts during planning (entry point, post-submit, return navigation, attribute selection) framed for users who don't know how an application form should be built.

**Tech Stack:** Markdown only. Verified by `python scripts/lint_skills.py` (12 rules) and `python -m pytest tests/test_lint_skills.py -v`.

---

## File Structure

- Modify: `skills/build-using-strata-sdk/SKILL.md` (full rewrite of step ordering and section bodies; references symlinks unchanged)

No new files. References live at `skills/build-using-strata-sdk/references/*` as symlinks to `references/*` — keep as-is.

---

### Task 1: Capture pre-state and confirm linter baseline

**Files:**
- Read: `skills/build-using-strata-sdk/SKILL.md`
- Run: `scripts/lint_skills.py`

- [ ] **Step 1: Read current SKILL.md fully**

Run: `wc -l skills/build-using-strata-sdk/SKILL.md`
Expected: `389 skills/build-using-strata-sdk/SKILL.md`

- [ ] **Step 2: Run linter to confirm green baseline**

Run: `python scripts/lint_skills.py`
Expected: exit 0, no errors against `build-using-strata-sdk`. Record output.

- [ ] **Step 3: Run unit tests to confirm green baseline**

Run: `python -m pytest tests/test_lint_skills.py -v`
Expected: all pass.

---

### Task 2: Reorder — promote SDK clone + exploration before planning

**Files:**
- Modify: `skills/build-using-strata-sdk/SKILL.md` (header + Steps 1–3 area)

Goal: After confirm-intent and locate-rails-dir, clone the SDK and explore it, **before** any planning question is asked. Move current Step 8 (clone) and add an "explore SDK" sub-step that catalogs generators, docs, and attribute types.

- [ ] **Step 1: Replace Step 1 ("Confirm intent") with new Step 1 — keep verbatim prompt, no body changes**

Edit `skills/build-using-strata-sdk/SKILL.md`. Heading stays `## Step 1: Confirm intent`. Body stays identical to current lines 18–26.

- [ ] **Step 2: Replace current Step 3 ("Locate the Rails app directory") with new Step 2 — same body, renumber only**

Edit heading to `## Step 2: Locate the Rails app directory`. Body identical to current lines 104–135. Update intra-doc reference "Run all `<RAILS_DIR>` paths in `references/ruby-version-check.md` relative to the directory chosen in Step 3" → "...chosen in Step 2".

- [ ] **Step 3: Insert new Step 3 — Clone SDK + Step 4 — Explore SDK**

Insert this body after the renumbered locate-rails-dir step:

````markdown
## Step 3: Clone the Strata SDK locally

Clone the Strata SDK Rails repo into `tmp/strata-sdk/` inside `<RAILS_DIR>` so docs, generators, and source are readable without network access for the rest of the skill.

```sh
git clone --depth 1 https://github.com/navapbc/strata-sdk-rails.git tmp/strata-sdk
```

If clone fails (network, auth, proxy/VPN), stop and report — do not proceed without local docs.

Append `/tmp/strata-sdk/` to `<RAILS_DIR>/.gitignore` if not already present.

## Step 4: Explore the SDK before planning

Read the SDK before asking the user any planning questions. Planning that ignores the SDK produces plans the SDK cannot fulfill.

**4a. Catalog available docs:**

```sh
ls tmp/strata-sdk/docs/
```

Read at least:

| What to find | Typical path |
|--------------|--------------|
| Application form guide | `tmp/strata-sdk/docs/intake-application-forms.md` |
| Strata attribute types | `tmp/strata-sdk/docs/strata-attributes.md` |
| Architecture / model relationships | any architecture/overview doc in `tmp/strata-sdk/docs/` |

**4b. Catalog available generators:**

```sh
ls tmp/strata-sdk/lib/generators/strata/
```

For every generator found, read its `USAGE` file (or `*_generator.rb`) and record:

- Name (e.g. `strata:application_form`, `strata:migration`, `strata:scaffold`, `strata:controller`)
- What it produces (model, specs, migration, controller, views, routes, fixtures)
- Required arguments and supported attribute syntax

Save the inventory in memory for Step 5 — every code-producing step in this skill must prefer an SDK generator over hand-writing files when a matching generator exists.

**4c. Build a short SDK summary** (kept in working memory, used in Step 5) covering:

- How application forms relate to the rest of a Strata app (cases, business processes, tasks, users) — even if those are out of scope for this skill, the user's questions may depend on knowing them.
- The supported attribute types and any aliases.
- The status lifecycle the SDK ships (`in_progress`, `submitted`, etc.) and which fields are mandatory on every form.
- Which generators are available for each artifact (model, migration, controller, views, specs).

If a doc is missing or the generator inventory is empty, stop and tell the user the SDK clone is incomplete — re-clone or pin to a tag that has the expected layout.
````

- [ ] **Step 4: Run linter after edit**

Run: `python scripts/lint_skills.py`
Expected: exit 0, body line count still ≤ 500.

- [ ] **Step 5: Commit**

```bash
git add skills/build-using-strata-sdk/SKILL.md
git commit -m "refactor(strata-sdk): clone+explore SDK before planning

Promote SDK clone and exploration ahead of the planning phase so
clarifying questions are informed by the SDK's docs, generators, and
attribute catalog instead of guessed defaults."
```

---

### Task 3: Rewrite the Planning Phase (now Step 5) with SDK-informed clarifying questions

**Files:**
- Modify: `skills/build-using-strata-sdk/SKILL.md` (Step 5 — Planning Phase)

Goal: Replace the standalone Step 2 planning phase (current lines 28–102) with a new Step 5 whose questions are grounded in the SDK summary from Step 4 and that assumes the user does not know how an application form should be built. The new prompts must (a) explain Strata concepts in one line each before asking, (b) propose SDK-supported defaults, and (c) iterate until confirmed.

- [ ] **Step 1: Delete the old `## Step 2: Planning Phase` block (current lines 28–102)**

Edit `skills/build-using-strata-sdk/SKILL.md`. Remove that entire section.

- [ ] **Step 2: Insert new `## Step 5: Planning Phase` after the Explore-SDK step**

Insert this body:

````markdown
## Step 5: Planning Phase (SDK-informed)

Use the Step 4 SDK summary throughout. Every question below should already include the SDK's defaults so the user can simply confirm. Assume the user is **not** an expert on Strata application forms — explain each concept in one line before asking.

Ask each question in sequence — wait for an answer before asking the next. Iterate until the user confirms.

**5a. Application type and form name**

> A Strata application form is a Rails model that extends `Strata::ApplicationForm` and represents one applicant's submission. **What program is this form for?** (e.g. unemployment benefits, SNAP, Medicaid, housing assistance, passport, business license, appeal, other)

Derive `<FORM_NAME>` (e.g. `UnemploymentApplicationForm`) and save `<APP_TYPE>`.

**5b. Attribute selection — propose SDK-supported defaults**

> Each piece of data the form collects is a **Strata attribute** with a typed widget (e.g. `name`, `address`, `tax_id`, `memorable_date`, `email`, `phone`). I'll suggest a starter set based on the SDK's catalog and `<APP_TYPE>`, then we'll refine it together.

Propose a starter set drawn **only** from `tmp/strata-sdk/docs/strata-attributes.md`. Common base:

| Attribute | Strata type | Why |
|-----------|-------------|-----|
| `name` | `name` | Applicant full name |
| `birth_date` | `memorable_date` | DOB |
| `residential_address` | `address` | Mailing/residential |
| `email` | `email` | Contact |
| `phone` | `phone` | Contact |

Tailor by program (only if SDK supports the type):

- **Unemployment:** last employer, last day worked, reason for separation, weekly earnings
- **SNAP:** household size, monthly income, household members, expenses
- **Medicaid:** household size, income, citizenship status, disability status

Ask:

> **Confirm this attribute list, or tell me what to add/remove. (yes / edit)**

Save `<ATTRS>` as `name:strata_type` pairs separated by spaces. Every type must appear in the SDK attribute catalog from Step 4 — if not, propose a supported substitute and re-ask.

**5c. Entry point — explain options first**

> After a user signs in, they need a way to reach this form. The most common patterns are: a post-login landing page, a dashboard card/link, or a button on an existing page. **Which fits your app?**
>
> 1. Landing page after login (the form is the root for authenticated users)
> 2. Link or card on an existing dashboard
> 3. Button on a specific page (which one?)
> 4. Other (describe)

Save as `<ENTRY_POINT>`.

**5d. Post-submission behavior**

> When the user clicks Submit, the form transitions to `status: 'submitted'` and becomes immutable. **What should the user see immediately after?**
>
> 1. Confirmation/review page showing every value they entered (read-only)
> 2. Redirect to dashboard with a success flash message
> 3. Other (describe)

Save as `<POST_SUBMIT>`.

**5e. Return navigation**

> If the user comes back later (after submitting), the form is locked. **What should they see when they revisit the entry point?**
>
> 1. The submitted application in read-only form
> 2. A blank form to start a new application
> 3. A list of all their submitted applications
> 4. Other (describe)

Save as `<RETURN_BEHAVIOR>`.

**5f. Surface SDK-driven follow-ups**

Based on the SDK summary from Step 4, ask any of the following that are relevant — only if the user hasn't already answered:

- Does this form need to attach to an existing **case** (or create one on submit)?
- Should submission kick off a **business process** or assign a **task** to a caseworker? (Note that the build of cases/processes/tasks is out of scope for this skill — but if the user says yes, flag it in the plan as a follow-up so they don't expect it to ship in this run.)
- Does the program require an SSN? If so, add `ssn:tax_id` to `<ATTRS>` and re-confirm 5b.
- Are there required attachments (uploads)? If so, check whether the SDK exposes an `attachment` attribute and add it; otherwise flag as out-of-scope.

Re-prompt 5b if any answer changes the attribute list.
````

- [ ] **Step 3: Run linter**

Run: `python scripts/lint_skills.py`
Expected: exit 0, body line count ≤ 500.

- [ ] **Step 4: Commit**

```bash
git add skills/build-using-strata-sdk/SKILL.md
git commit -m "refactor(strata-sdk): SDK-informed planning phase

Rewrite planning prompts so each question explains the Strata concept
first, defaults come from the SDK attribute catalog, and follow-up
questions surface case/process/task/upload concerns the user may not
know to ask about."
```

---

### Task 4: Add post-plan re-validation step (Step 6) and write-plan handoff (Step 7)

**Files:**
- Modify: `skills/build-using-strata-sdk/SKILL.md`

Goal: After planning, validate the plan against the SDK clone before any code is touched. Replace the current "Step 4: Write the plan document" + "Step 5: User confirms plan" with two steps that (a) write the plan via the writing-plans reference and (b) re-validate the plan against the SDK clone.

- [ ] **Step 1: Remove current "Step 4: Write the plan document" and "Step 5: User confirms plan" sections**

Edit the file. Delete current lines 137–162 (these are the old Step 4 + Step 5 bodies).

- [ ] **Step 2: Insert new Step 6 — Write the plan**

Insert:

````markdown
## Step 6: Write the plan

Follow [`references/writing-plans.md`](references/writing-plans.md). Save to `<RAILS_DIR>/docs/<app-type>-application-form-plan.md`. The plan header must list:

- `<APP_TYPE>` → `<FORM_NAME>`
- `<ATTRS>` table (Strata type + reason)
- `<ENTRY_POINT>`, `<POST_SUBMIT>`, `<RETURN_BEHAVIOR>`
- Generators that will be invoked (taken from the Step 4 inventory) for each artifact: model, migration, controller, views, specs
- Out-of-scope items surfaced in 5f (cases, business processes, tasks, attachments) — listed but not built

Tell the user:

> Plan written to `docs/<app-type>-application-form-plan.md`. Reply **confirm** to begin, or describe changes and I'll update the plan.

Iterate until the user confirms.
````

- [ ] **Step 3: Insert new Step 7 — Re-validate plan against the SDK**

Insert directly after Step 6:

````markdown
## Step 7: Re-validate the plan against the SDK

Before any code or generator runs, walk the confirmed plan against the SDK clone one more time:

| Check | Source of truth |
|-------|-----------------|
| Every `<ATTRS>` type exists | `tmp/strata-sdk/docs/strata-attributes.md` |
| Form name extends `Strata::ApplicationForm` | `tmp/strata-sdk/docs/intake-application-forms.md` |
| Every artifact in the plan has a matching generator | Step 4 generator inventory |
| Required base columns (`status`, `user_id`, `submitted_at`) are in the migration plan | SDK form guide |
| `<ENTRY_POINT>` / `<POST_SUBMIT>` / `<RETURN_BEHAVIOR>` are achievable with SDK-provided helpers | SDK form guide |

If any check fails, update the plan, re-confirm with the user, and repeat this step. Do not proceed to Step 8 until every check passes.
````

- [ ] **Step 4: Run linter**

Run: `python scripts/lint_skills.py`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add skills/build-using-strata-sdk/SKILL.md
git commit -m "refactor(strata-sdk): add post-plan SDK re-validation step

Force a final SDK-vs-plan walk before any generator runs so attribute
types, generator availability, and required base columns are verified
against the local clone instead of assumed."
```

---

### Task 5: Renumber and slim ruby-check + gem install + remove redundant clone step

**Files:**
- Modify: `skills/build-using-strata-sdk/SKILL.md`

Goal: New Step 8 is ruby-version-check (one paragraph + reference pointer, no inlined A/B/C/D/E content). New Step 9 is gem install. Remove the old Step 8 (clone) since its content moved into Steps 3–4.

- [ ] **Step 1: Replace Step 6 (ruby check) with new Step 8**

Edit the file. Replace the current `## Step 6: Verify Ruby version matches the project` body with:

````markdown
## Step 8: Verify Ruby version matches the project

Follow [`references/ruby-version-check.md`](references/ruby-version-check.md). Do not proceed until `ruby -v` matches the project's required version and `bundle -v` succeeds.
````

(Drop the inlined A/B/C/D/E summary — the reference is the source of truth.)

- [ ] **Step 2: Renumber current Step 7 to new Step 9**

Heading: `## Step 9: Install the strata_sdk_rails gem`. Body: keep 7a/7b/7c verbatim from current lines 182–212.

- [ ] **Step 3: Delete the current `## Step 8: Clone the SDK repository for local reference` block**

Its content was moved to new Steps 3–4. Remove current lines 214–246.

- [ ] **Step 4: Run linter**

Run: `python scripts/lint_skills.py`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add skills/build-using-strata-sdk/SKILL.md
git commit -m "refactor(strata-sdk): slim ruby check and remove duplicate clone step

Drop inlined A/B/C/D/E summary — the ruby-version-check reference is
the source of truth. Remove the now-duplicate clone step."
```

---

### Task 6: Rewrite generator + TDD steps to always prefer generators with TDD-around-output

**Files:**
- Modify: `skills/build-using-strata-sdk/SKILL.md`

Goal: Current Steps 9–11 hand-roll TDD before every generator. Replace with: "use the SDK generator first; it produces model + specs + migration + view templates; then update the generated specs to assert real behavior; run the specs to watch them fail; edit the generated code (not the spec) until they pass; lint." This matches the user's directive and the TDD reference's "generated code" exception.

- [ ] **Step 1: Replace Steps 9–11 with new Steps 10–12**

Delete current Steps 9, 10, 11 (current lines 248–357). Insert:

````markdown
## Step 10: Generate the model (and its specs) via the SDK generator

The SDK ships generators that produce the model file **and** baseline RSpec specs. Always use them — never hand-write a model when a generator exists.

**10a. Re-read the relevant SDK doc:** `tmp/strata-sdk/docs/intake-application-forms.md`. Confirm the generator name and argument format. (Step 4 already inventoried it — re-read to be sure nothing changed.)

**10b. Run the generator:**

```sh
bin/rails generate strata:application_form <FormName> <ATTRS>
```

**10c. TDD around the generator output.** The generator produces production code and a stub spec. The stub is *generated code* — under [`references/test-driven-development.md`](references/test-driven-development.md) it does not have to be written test-first, but every change you make from this point onward does.

Apply this loop for each behavior the plan requires:

1. Open the stub spec at `spec/models/strata/<form_name>_spec.rb`.
2. Add or strengthen an example to assert the real behavior (e.g. attribute typing, required validations from the SDK doc, `submitted` immutability).
3. Run `make test` and watch that example **fail** for the right reason.
4. Edit `app/models/strata/<form_name>.rb` (the generated file) until the example passes.
5. Run `make test` (green) then `make lint` (green).
6. Commit before moving to the next behavior.

If the generated model extends `ApplicationRecord` instead of `Strata::ApplicationForm`, fix it in step 4 of the loop.

## Step 11: Generate the migration via the SDK generator and migrate

```sh
bin/rails generate strata:migration status:integer user_id:uuid submitted_at:datetime <ATTRS>
bin/rails db:migrate
```

Then `make test && make lint`. If a previously-passing spec fails because of the migration, fix the migration — never weaken the spec.

## Step 12: Generate views + controller + routes via the SDK generator and wire the entry point

**12a. Use the SDK generator** (`strata:scaffold`, `strata:controller`, or whatever Step 4 identified) to produce controller, views, routes, and request/system specs. Hand-writing these files is a fallback only — if no generator covers the artifact, note it in the plan.

**12b. TDD around the generator output**, one behavior at a time. For each of the items below, open the relevant generated spec, strengthen it, watch it fail, edit the generated controller/view/route until it passes, then `make lint`:

- `GET <form>/new` → 200 for authed user, redirect otherwise
- `POST <form>` valid → record created, `status: 'in_progress'`
- `POST <form>` invalid → re-render with errors
- `<POST_SUBMIT>` behavior matches the chosen option
- `<RETURN_BEHAVIOR>` matches the chosen option
- `<ENTRY_POINT>` reaches the form per the chosen option

Show route diffs and view edits to the user before saving.

If a generated spec passes immediately without any code edit, the spec is too weak — strengthen it before moving on. (TDD discipline: see [`references/test-driven-development.md`](references/test-driven-development.md).)
````

- [ ] **Step 2: Run linter**

Run: `python scripts/lint_skills.py`
Expected: exit 0, body ≤ 500 lines.

- [ ] **Step 3: Commit**

```bash
git add skills/build-using-strata-sdk/SKILL.md
git commit -m "refactor(strata-sdk): generator-first TDD loop

Always run the SDK generator before writing code. Treat generator
output as scaffolding, then strengthen the generated specs, watch
them fail, and edit the generated code to pass — instead of writing
specs from scratch only to invoke a generator that overwrites them."
```

---

### Task 7: Strip remaining redundancy — verify + report sections lean on references

**Files:**
- Modify: `skills/build-using-strata-sdk/SKILL.md`

Goal: Final two steps + the skill header should not re-state TDD/verification rules; they should point at the references.

- [ ] **Step 1: Replace `## Step 12: Verify` with new `## Step 13: Verify`**

````markdown
## Step 13: Verify

```sh
make lint
make test
```

Both must pass. If either fails, stop and report — do not move to Step 14.
````

- [ ] **Step 2: Replace `## Step 13: Report` with new `## Step 14: Report`**

````markdown
## Step 14: Report

Confirm `make lint` and `make test` both passed in the current message before reporting — see [`references/verification.md`](references/verification.md).

> **Application form ready.** Run `make start-container` and visit the entry point you chose. The form lives at `app/models/strata/<form_name>.rb`. Plan: `docs/<app-type>-application-form-plan.md`. SDK reference docs: `tmp/strata-sdk/docs/`. Re-run `git -C tmp/strata-sdk pull` after upgrading the gem to keep docs in sync.
````

- [ ] **Step 3: Trim the skill overview block (current lines 6–17)**

Replace with:

````markdown
# Build Using Strata SDK

## Overview

Extends an existing Strata Rails app (typically scaffolded by `build-strata-rails-app`) with a Strata SDK application form. This skill clones the SDK locally, plans the form against the SDK's actual generators and attribute catalog, then drives the SDK's generators to produce the model, specs, migration, controller, and views — applying TDD to every change made on top of generator output.

**Scope:** application forms only. Cases, business processes, tasks, and attachments are surfaced during planning but built elsewhere.

**TDD is mandatory** for every change made on top of generator output: see [`references/test-driven-development.md`](references/test-driven-development.md).

**Before reporting completion**, see [`references/verification.md`](references/verification.md).
````

- [ ] **Step 4: Confirm "Common pitfalls" and "Reference" sections still apply**

Open the file. The pitfalls table and Reference list at the bottom still apply. Update only the "Build plan" path entry if needed; otherwise leave intact.

- [ ] **Step 5: Run linter and tests**

Run: `python scripts/lint_skills.py && python -m pytest tests/test_lint_skills.py -v`
Expected: linter exit 0, all tests pass, body ≤ 500 lines.

- [ ] **Step 6: Diff review**

Run: `git diff skills/build-using-strata-sdk/SKILL.md | wc -l`
Read the diff end-to-end. Confirm:
- Steps now numbered 1–14 with no gaps.
- No section duplicates content from a referenced file.
- Every code-producing step prefers a generator.

- [ ] **Step 7: Commit**

```bash
git add skills/build-using-strata-sdk/SKILL.md
git commit -m "refactor(strata-sdk): defer to references for TDD/verification rules

Stop restating the TDD iron laws and verification gate inside the
skill body — point at the shared references instead. Keeps the skill
under the 500-line cap and avoids drift between skill and references."
```

---

### Task 8: Final verification

**Files:**
- Run: `scripts/lint_skills.py`, `tests/test_lint_skills.py`

- [ ] **Step 1: Linter green**

Run: `python scripts/lint_skills.py`
Expected: exit 0.

- [ ] **Step 2: Tests green**

Run: `python -m pytest tests/test_lint_skills.py -v`
Expected: all pass.

- [ ] **Step 3: Body length under cap**

Run: `wc -l skills/build-using-strata-sdk/SKILL.md`
Expected: ≤ 500 (frontmatter included; the linter enforces 500-line body cap separately).

- [ ] **Step 4: Spot-check ordering**

Run: `grep -n '^## Step' skills/build-using-strata-sdk/SKILL.md`
Expected output (in order):
```
## Step 1: Confirm intent
## Step 2: Locate the Rails app directory
## Step 3: Clone the Strata SDK locally
## Step 4: Explore the SDK before planning
## Step 5: Planning Phase (SDK-informed)
## Step 6: Write the plan
## Step 7: Re-validate the plan against the SDK
## Step 8: Verify Ruby version matches the project
## Step 9: Install the strata_sdk_rails gem
## Step 10: Generate the model (and its specs) via the SDK generator
## Step 11: Generate the migration via the SDK generator and migrate
## Step 12: Generate views + controller + routes via the SDK generator and wire the entry point
## Step 13: Verify
## Step 14: Report
```

- [ ] **Step 5: Report to user**

Print: `Restructured. SDK clone+explore moved before planning. Planning prompts SDK-informed. Plan re-validated post-write. Generators preferred everywhere. TDD/verification/plan-writing/ruby-check now reference-only — no inlined duplication. Lint + tests green.`

---

## Self-Review Notes

- **Spec coverage:** clone-before-plan ✓ (Tasks 2–3), SDK exploration informs planning ✓ (Tasks 2, 3), post-plan SDK validation ✓ (Task 4), generators always preferred ✓ (Task 6), TDD around generated output ✓ (Task 6), redundancy reduction ✓ (Tasks 5, 7), SDK-informed clarifying questions for non-expert users ✓ (Task 3, 5f).
- **Placeholders:** none — every step shows the exact replacement markdown.
- **Type/path consistency:** every reference path matches existing symlinks under `skills/build-using-strata-sdk/references/`. Step numbers are consistent across all tasks.
