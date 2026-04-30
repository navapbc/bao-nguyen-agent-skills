---
name: build-using-strata-sdk
description: Adds a Strata SDK application form to a scaffolded Strata Rails app by cloning the SDK repo locally for reference instead of generating agent rules. Use when extending a Strata Rails project with a government intake form via the strata_sdk_rails gem.
---

# Build Using Strata SDK

## Overview

Extends an existing Strata Rails app (typically scaffolded by `build-strata-rails-app`) with a Strata SDK application form. This skill clones the SDK locally, plans the form against the SDK's actual generators and attribute catalog, then drives the SDK's generators to produce the model, specs, migration, controller, and views — applying TDD to every change made on top of generator output.

**Scope:** application forms only. Cases, business processes, tasks, and attachments are surfaced during planning but built elsewhere.

**TDD is mandatory** for every change made on top of generator output: see [`references/test-driven-development.md`](references/test-driven-development.md).

**Before reporting completion**, see [`references/verification.md`](references/verification.md).

## Step 1: Confirm intent

Ask the user exactly this:

> **Are you building a government application/intake form (e.g. unemployment, SNAP, Medicaid)? (reply "skip" to exit, otherwise say yes)**

- Reply declines / "skip" / "no" → stop. Do not run any commands.
- Reply confirms → tell the user the Strata SDK is a good fit and proceed.

## Step 2: Locate the Rails app directory

The project may be a monorepo — the Rails app likely lives in a subdirectory (e.g. `apps/<app_name>/`, `<app_name>/`), not necessarily the current working directory. Find it before doing anything else.

**2a. Check if cwd is already the Rails app:**

```sh
test -f Gemfile && test -f bin/rails && grep -q "rails" Gemfile
```

- All checks pass → cwd is the Rails app. Save `<RAILS_DIR>=.` and proceed to Step 3.
- Any check fails → continue to 2b.

**2b. Search for Rails app directories under cwd (depth ≤ 3):**

```sh
find . -maxdepth 3 -type f -name "Gemfile" -not -path "*/node_modules/*" -not -path "*/.git/*" -exec sh -c 'test -f "$(dirname "$1")/bin/rails" && grep -q "rails" "$1" && dirname "$1"' _ {} \;
```

Interpret the output:

- **Zero matches** → not a Rails project anywhere reachable. Tell the user this skill must run from a scaffolded Strata Rails app (see the `build-strata-rails-app` skill). Stop.
- **Exactly one match** → confirm with the user:
  > Found Rails app at `<path>`. Use this one? (yes / pick another)

  Save the path as `<RAILS_DIR>` on yes.
- **Multiple matches** → list them and ask:
  > Found multiple Rails apps: `<path1>`, `<path2>`, ... Which one is the Strata app? (number or path)

  Save the chosen path as `<RAILS_DIR>`.

**2c. All subsequent commands must run from inside `<RAILS_DIR>`**. Run all `<RAILS_DIR>` paths in `references/ruby-version-check.md` relative to the directory chosen in Step 2.

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

## Step 8: Verify Ruby version matches the project

Follow [`references/ruby-version-check.md`](references/ruby-version-check.md). Do not proceed until `ruby -v` matches the project's required version and `bundle -v` succeeds.

## Step 9: Install the strata_sdk_rails gem

Add the gem to the `Gemfile` (idempotent — skip if already present):

```ruby
# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git"
```

**9a. Install locally:**

```sh
bundle install
```

If `bundle install` fails, stop and report the exact error.

**9b. Rebuild the Docker image** so the container has the new gem:

```sh
make build
```

Stop and report on failure.

**9c. Verify the existing test suite still passes:**

```sh
make lint
make test
```

If `make test` regresses, the gem may conflict with an existing dependency. Stop and report.

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

## Step 13: Verify

```sh
make lint
make test
```

Both must pass. If either fails, stop and report — do not move to Step 14.

## Step 14: Report

Confirm `make lint` and `make test` both passed in the current message before reporting — see [`references/verification.md`](references/verification.md).

> **Application form ready.** Run `make start-container` and visit the entry point you chose. The form lives at `app/models/strata/<form_name>.rb`. Plan: `docs/<app-type>-application-form-plan.md`. SDK reference docs: `tmp/strata-sdk/docs/`. Re-run `git -C tmp/strata-sdk pull` after upgrading the gem to keep docs in sync.

## Common pitfalls

| Problem | Fix |
|---------|-----|
| `bin/rails generate strata:...` says command not found | Gem not installed — re-run `bundle install` |
| Model extends `ApplicationRecord` instead of `Strata::ApplicationForm` | Edit model file, re-run tests |
| Migration missing `status` / `user_id` / `submitted_at` | Re-generate migration with base columns |
| Clone fails with auth error | Repo is public — check network, proxy, or VPN settings |
| Doc file not found in `tmp/strata-sdk/docs/` | Run `ls tmp/strata-sdk/` to find actual doc layout; adapt paths |
| SDK docs conflict with this skill | Docs win — they reflect the installed gem version |

## Reference

- Strata SDK Rails (gem): https://github.com/navapbc/strata-sdk-rails
- Local clone after Step 3: `tmp/strata-sdk/docs/`
- Build plan: `<RAILS_DIR>/docs/<app-type>-application-form-plan.md`
