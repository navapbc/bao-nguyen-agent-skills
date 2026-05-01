---
name: build-using-strata-sdk
description: Adds a Strata SDK application form to a scaffolded Strata Rails app by cloning the SDK repo locally for reference instead of generating agent rules. Use when extending a Strata Rails project with a government intake form via the strata_sdk_rails gem.
---

# Build Using Strata SDK

## Overview

Extends an existing Strata Rails app (typically scaffolded by `build-strata-rails-app`) with a Strata SDK application form. This skill clones the SDK locally, plans the form against the SDK's actual generators and attribute catalog, then drives the SDK's generators to produce the model, specs, migration, controller, and views — applying TDD to every change made on top of generator output.

**Scope:** application forms, their associated cases, and the business processes that govern them. Tasks and attachments are surfaced during planning but built elsewhere.

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
| Generators overview | `tmp/strata-sdk/docs/generators.md` |
| Multi-page form flows | `tmp/strata-sdk/docs/multi-page-form-flows.md` |
| Case management business process | `tmp/strata-sdk/docs/case-management-business-process.md` |

**4b. Catalog available generators:**

```sh
ls tmp/strata-sdk/lib/generators/strata/
```

Expected inventory: `application_form`, `application_form_views`, `business_process`, `case`, `determination`, `income_records_migration`, `migration`, `model`, `rules`, `staff`, `task`. Read each `USAGE` file and the `*_generator.rb` source. Record per generator:

Key facts to encode (note hyphenated option flags: `--business-process`, `--application-form`, `--skip-*`):

- `strata:application_form` → model + auto-chains `strata:model` (writes migration with base attrs `user_id:uuid`, `status:integer`, `submitted_at:datetime`). Auto-suffixes `ApplicationForm`. **No separate migration step needed.**
- `strata:case` → model at `app/models/strata/<name>_case.rb` + **staff** controller at `app/controllers/<cases>_controller.rb`, staff views (`index`, `show`, `documents`, `tasks`, `notes`), routes scoped under `/staff`, locales. Auto-suffixes `Case`. Prompts to chain BP and AF if missing. Case base attrs include `application_form_id:uuid` — Case `belongs_to :application_form`, **not** the reverse.
- `strata:business_process` → file at `app/business_processes/<name>_business_process.rb` (NOT `app/models/`) + edits `config/application.rb` to register event listening.
- `strata:application_form_views` → applicant views from a `Strata::Flows::ApplicationFormFlow` subclass. Requires the flow class to exist first.
- `strata:migration` → ad-hoc only; **do not** re-run for the application form (already created by `strata:application_form`).
- `strata:task`, `strata:staff`, `strata:model`, `strata:rules`, `strata:determination`, `strata:income_records_migration` → mostly out of scope here.

Save the inventory in memory for Step 5 — every code-producing step in this skill must prefer an SDK generator over hand-writing files when a matching generator exists.

**4c. Build a short SDK summary** (kept in working memory, used in Step 5) covering:

- ApplicationForm ↔ Case ↔ BusinessProcess relations: `Case belongs_to :application_form` via `application_form_id`. BusinessProcess governs case lifecycle (`business_process_current_step` lives on Case).
- Supported attribute types and aliases (from `strata-attributes.md`).
- Status lifecycle on `Strata::ApplicationForm`: enum `in_progress` (0) → `submitted` (1). `before_update :prevent_changes_if_submitted` enforces immutability post-submit.
- Two distinct UI surfaces: **staff dashboard** (output of `strata:case`, lives under `/staff`) vs **applicant form** (a `Strata::Flows::ApplicationFormFlow` + `strata:application_form_views` + hand-wired applicant controller, or `bin/rails generate scaffold`). They are NOT interchangeable.
- Recommended generation order per `docs/generators.md`: `strata:case` first (auto-chains BP + AF) → optional `strata:task` → define flow + run `strata:application_form_views`.

If a doc is missing or the generator inventory is empty, stop and tell the user the SDK clone is incomplete — re-clone or pin to a tag that has the expected layout.

## Step 5: Planning Phase (SDK-informed)

Use the Step 4 SDK summary throughout. Every question below should already include the SDK's defaults so the user can simply confirm. Assume the user is **not** an expert on Strata application forms — explain each concept in one line before asking.

Ask each question in sequence — wait for an answer before asking the next. Iterate until the user confirms.

**5a. Application type and form name**

> A Strata application form is a Rails model that extends `Strata::ApplicationForm` and represents one applicant's submission. **What program is this form for?** (e.g. unemployment benefits, SNAP, Medicaid, housing assistance, passport, business license, appeal, other)

Derive `<PROGRAM>` (the bare program name, e.g. `Unemployment`, `Passport`). The SDK's `strata:application_form` and `strata:case` generators **auto-suffix** `ApplicationForm` and `Case` — pass the bare program name. Save `<PROGRAM>` and `<APP_TYPE>`. Final class names: `<PROGRAM>ApplicationForm`, `<PROGRAM>Case`, `<PROGRAM>BusinessProcess`.

**5b. Attribute selection — propose SDK-supported defaults**

> Each piece of data the form collects is a **Strata attribute** with a typed widget (e.g. `name`, `address`, `tax_id`, `memorable_date`, `email`, `phone`). I'll suggest a starter set based on the SDK's catalog and `<APP_TYPE>`, then we'll refine it together. For fields the SDK doesn't cover, we'll use standard Rails types.

Propose a starter set from `tmp/strata-sdk/docs/strata-attributes.md`. Common base:

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

Save `<ATTRS>` as `name:type` pairs separated by spaces. Prefer Strata types from the SDK catalog. If no Strata type covers a needed field, fall back to a Rails primitive (`string`, `integer`, `boolean`, `date`, `datetime`, `decimal`, `text`). Note primitive-type attributes in the plan — they won't get a Strata widget and need a plain form field in the view.

**5c. Attribute validations**

> Each attribute can have Rails validations (e.g. presence/required, format, numericality). Based on the attributes you chose, I'll propose sensible defaults — confirm or edit.

Propose defaults based on `<ATTRS>`:

- Contact/identity fields (`name`, `email`, `phone`, `ssn`/`tax_id`) → `presence: true`
- `email` → format validation
- `phone` → format validation
- Numeric fields (income, household size, etc.) → `numericality: { greater_than: 0 }`
- Date fields → `presence: true` if required

Ask:

> **Confirm these validations, or tell me what to add/remove. (yes / edit)**

Save as `<VALIDATIONS>` map (`attr_name: [validation_list]`). TDD in Step 10 will drive these via spec → model loop.

**5d. Form layout — single page or multi-page flow**

> Application forms can be a single scrollable page or split into multiple pages. The SDK's preferred pattern for multi-page is `Strata::Flows::ApplicationFormFlow` — a DSL of `task :group { question_page :field }` that drives auto-generated routes, controller actions, and views (via `strata:application_form_views`). Default SDK guidance is one question per page. **How should this form work?**
>
> 1. Single page — all fields on one screen, one Submit button (use `bin/rails generate scaffold` for views, or hand-write)
> 2. Multi-page flow — fields split into tasks/pages using `Strata::Flows::ApplicationFormFlow` DSL + `strata:application_form_views`

If multi-page: ask how many tasks, task names, and which `<ATTRS>` are question pages under each task. Default to one field per page; allow grouped pages where it improves UX (e.g. name + birth date).

Save as `<FORM_LAYOUT>` — either `single` or an ordered map of `task_name: [question_pages]` where each question_page maps to one or more `<ATTRS>`.

The flow class itself is hand-written (no generator for `ApplicationFormFlow`). Step 14 will scaffold the class then run `strata:application_form_views <FLOW_CLASS> <FORM_CLASS>` to materialize the views.

**5e. Entry point — explain options first**

> After a user signs in, they need a way to reach this form. The most common patterns are: a post-login landing page, a dashboard card/link, or a button on an existing page. **Which fits your app?**
>
> 1. Landing page after login (the form is the root for authenticated users)
> 2. Link or card on an existing dashboard
> 3. Button on a specific page (which one?)
> 4. Other (describe)

Save as `<ENTRY_POINT>`.

**5f. Post-submission behavior**

> When the user clicks Submit, the form transitions to `status: 'submitted'` and becomes immutable. **What should the user see immediately after?**
>
> 1. Confirmation/review page showing every value they entered (read-only)
> 2. Redirect to dashboard with a success flash message
> 3. Other (describe)

Save as `<POST_SUBMIT>`.

**5g. Return navigation**

> If the user comes back later (after submitting), the form is locked. **What should they see when they revisit the entry point?**
>
> 1. The submitted application in read-only form
> 2. A blank form to start a new application
> 3. A list of all their submitted applications
> 4. Other (describe)

Save as `<RETURN_BEHAVIOR>`.

**5h. Case and business process — required wiring**

> Application forms must be tied to a **case** (one applicant's program instance), which is governed by a **business process** (the workflow rules). Without these, the form has no lifecycle owner.

Ask in sequence:

**i.** Check `app/business_processes/` for an existing business process. If found, confirm its name. If not: default to `<PROGRAM>BusinessProcess`. Save as `<BUSINESS_PROCESS_NAME>`, `<BUSINESS_PROCESS_EXISTS>`.

**ii.** Check `app/models/strata/` for an existing case type. If found, confirm its name. If not: default to `<PROGRAM>Case`. Save as `<CASE_NAME>`, `<CASE_EXISTS>`.

**iii.** On submit, should the app create a new case or attach to an existing one? Save as `<CASE_TRIGGER>` (`create_new` / `attach_existing`).

These are **in scope** — built in Steps 10–11. Caseworker tasks remain out of scope; flag any mention as a follow-up.

**iv.** Does the program require an SSN? If so, add `ssn:tax_id` to `<ATTRS>` and re-confirm 5b and 5c.

**v.** Are there required attachments (uploads)? If the SDK exposes an `attachment` attribute, add it; otherwise flag as out-of-scope.

Re-prompt 5b and 5c if any answer changes the attribute list.

## Step 6: Write the plan

Follow [`references/writing-plans.md`](references/writing-plans.md). Save to `<RAILS_DIR>/docs/<app-type>-application-form-plan.md`. The plan header must list:

- `<APP_TYPE>` → `<FORM_NAME>`
- `<ATTRS>` table (type + reason; flag any primitive-type attributes)
- `<VALIDATIONS>` table (attribute → validations)
- `<FORM_LAYOUT>` (single page, or step map)
- `<ENTRY_POINT>`, `<POST_SUBMIT>`, `<RETURN_BEHAVIOR>`
- `<BUSINESS_PROCESS_NAME>` (new or existing), `<CASE_NAME>` (new or existing), `<CASE_TRIGGER>`
- Generators invoked for each artifact (taken from Step 4 inventory):
  - Case + chained BP + chained ApplicationForm model + migration: single `strata:case` invocation
  - Applicant views: hand-written `Strata::Flows::ApplicationFormFlow` subclass + `strata:application_form_views`
  - Applicant controller: NOT generated by SDK — `bin/rails generate scaffold` (single page) or hand-write (multi-page)
  - Staff dashboard: produced as side-effect of `strata:case` (under `/staff`) — note in plan but no extra work
- Out-of-scope items surfaced in 5h (tasks, attachments) — listed but not built

Tell the user:

> Plan written to `docs/<app-type>-application-form-plan.md`. Reply **confirm** to begin, or describe changes and I'll update the plan.

Iterate until the user confirms.

## Step 7: Re-validate the plan against the SDK

Before any code or generator runs, walk the confirmed plan against the SDK clone one more time:

| Check | Source of truth |
|-------|-----------------|
| Every `<ATTRS>` Strata type exists (primitives exempt) | `tmp/strata-sdk/docs/strata-attributes.md` |
| Form name extends `Strata::ApplicationForm`; case extends `Strata::Case` | `tmp/strata-sdk/docs/intake-application-forms.md`, `case-management-business-process.md` |
| Plan does NOT add `case_id` to the application form (relation is `Case belongs_to :application_form`) | `app/models/strata/case.rb` `base_attributes_for_generator` |
| Plan does NOT re-run `strata:migration` for the application form (already created by `strata:application_form` → `strata:model`) | `lib/generators/strata/application_form/application_form_generator.rb` |
| Plan does NOT assert `belongs_to :case` on the application form | same as above |
| Multi-page flow plan defines `Strata::Flows::ApplicationFormFlow` subclass and runs `strata:application_form_views <FLOW> <FORM>` | `tmp/strata-sdk/docs/multi-page-form-flows.md` |
| Single-page plan uses `bin/rails generate scaffold` or hand-writes the applicant controller | `tmp/strata-sdk/docs/intake-application-forms.md` |
| Plan distinguishes staff dashboard (from `strata:case`, `/staff` scope) from applicant form | `lib/generators/strata/case/case_generator.rb` |
| `<VALIDATIONS>` are expressible as Rails model validations | Rails docs |
| `<BUSINESS_PROCESS_NAME>` will be created by `strata:case` chaining or `strata:business_process` | Step 4 inventory |
| BP file path is `app/business_processes/`, NOT `app/models/` | `lib/generators/strata/business_process/business_process_generator.rb` |

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
make precompile-assets
```

Stop and report on failure. (`make precompile-assets` compiles front-end assets inside the container — skipping it causes asset-related test failures in 9c.)

**9c. Verify the existing test suite still passes:**

```sh
make lint
make test
```

If `make test` regresses, the gem may conflict with an existing dependency. Stop and report.

## Step 10: Check what already exists

Before generating, confirm whether the case, business process, and application form already exist:

```sh
find app/models/strata -type f -name "*case*.rb" 2>/dev/null
find app/business_processes -type f -name "*business_process*.rb" 2>/dev/null
find app/models/strata -type f -name "*application_form*.rb" 2>/dev/null
```

Set `<CASE_EXISTS>`, `<BUSINESS_PROCESS_EXISTS>`, `<FORM_EXISTS>`. If user said something exists but grep finds nothing, stop and re-confirm.

## Step 11: Generate case (chains BP + ApplicationForm + migration)

The SDK's preferred entry point is `strata:case`. It generates the case model, prompts to chain `strata:business_process` and `strata:application_form` (which itself chains `strata:model` → migration), and produces the staff dashboard controller/views/routes/locales. Single command, multiple artifacts.

**11a. Run the case generator:**

```sh
bin/rails generate strata:case <PROGRAM> <ATTRS> --business-process <PROGRAM>BusinessProcess --application-form <PROGRAM>ApplicationForm
```

Pass any of the following flags to skip chained pieces if `<*_EXISTS>` is true:

- `--skip-business-process` — BP already in `app/business_processes/`
- `--skip-application-form` — AF already in `app/models/strata/`

`<ATTRS>` here are the form's strata attributes; the case generator forwards them to the chained `strata:application_form` and the migrations are produced via the chained `strata:model`. Note: case base attrs (`application_form_id:uuid`, `status:integer`, `business_process_current_step:string`, `facts:jsonb`) are auto-injected; do not list them.

If the generator prompts interactively for missing classes, accept (`y`) — that's how the chain runs. The `--application-form` and `--business-process` flags pre-fill those names so the prompts don't ask again.

Outputs to verify after generation:

- `app/models/strata/<program>_case.rb` (extends `Strata::Case`)
- `app/models/strata/<program>_application_form.rb` (extends `Strata::ApplicationForm`)
- `app/business_processes/<program>_business_process.rb`
- `app/controllers/<program>_cases_controller.rb` (staff dashboard)
- `app/views/<program>_cases/{index,show,documents,tasks,notes}.html.erb`
- New migration(s) under `db/migrate/`
- Routes added under `scope path: "/staff"` block in `config/routes.rb`
- `config/application.rb` updated with `<PROGRAM>BusinessProcess.start_listening_for_events`

**11b. Run migrations:**

```sh
bin/rails db:migrate
```

**11c. Verify:**

```sh
make test && make lint
```

Any regression → fix before proceeding.

## Step 12: TDD-strengthen the generated application form model

The application form model and its baseline spec are generator output. Under [`references/test-driven-development.md`](references/test-driven-development.md), generator output may exist without a failing test first, but **every change from here is test-first**.

**12a. Re-read** `tmp/strata-sdk/docs/intake-application-forms.md` and `tmp/strata-sdk/app/models/strata/application_form.rb` to confirm what `Strata::ApplicationForm` already provides (status enum, `submitted_at`, `prevent_changes_if_submitted` callback, `publish_created` after_create).

**12b. TDD loop** for each behavior the plan requires:

1. Open `spec/models/strata/<program>_application_form_spec.rb`.
2. Add or strengthen an example: each `<ATTRS>` declared with the correct `strata_attribute :name, :type`; each `<VALIDATIONS>` rule fires; submitting transitions `status` to `submitted`; post-submit edits raise.
3. `make test` → watch fail for the right reason.
4. Edit `app/models/strata/<program>_application_form.rb` until green.
5. `make test` green → `make lint` green.
6. Commit before next behavior.

**Do NOT** add `belongs_to :<case>` to the application form — the relation lives on Case (`Case belongs_to :application_form` via `application_form_id`). If the generated model extends `ApplicationRecord` instead of `Strata::ApplicationForm`, fix it inside the TDD loop (write a spec asserting `< Strata::ApplicationForm`, watch fail, fix, green).

## Step 13: TDD-strengthen the case model and business process

**13a. Case model** (`app/models/strata/<program>_case.rb`): TDD loop to verify

- extends `Strata::Case`
- `belongs_to :application_form` resolves to `<PROGRAM>ApplicationForm`
- `business_process` class method returns `<PROGRAM>BusinessProcess`

**13b. Business process** (`app/business_processes/<program>_business_process.rb`): TDD loop to define each step from the plan (`applicant_task`, `system_process`, `staff_task`, transitions). Drive every step in via spec → fail → implement → green → lint → commit.

**13c. Verify** after each commit:

```sh
make test && make lint
```

## Step 14: Build the applicant-facing form UI

Step 11 already produced the **staff dashboard** under `/staff`. This step builds the **applicant-facing** form — a separate UI surface. The SDK does not generate the applicant controller; it provides view scaffolding only via `strata:application_form_views` (which requires a flow class).

**14a. Single-page layout** (when `<FORM_LAYOUT>` is `single`):

```sh
bin/rails generate scaffold <PROGRAM>ApplicationForm <ATTRS> --skip-migration --model-name=<PROGRAM>ApplicationForm
```

`--skip-migration` is mandatory — the migration already exists from Step 11. Then TDD-strengthen the generated controller/views/routes per Step 14c.

**14b. Multi-page layout** (when `<FORM_LAYOUT>` is a task map):

1. Hand-write the flow class at `app/flows/<program>_application_form_flow.rb` — `include Strata::Flows::ApplicationFormFlow`, then a `task :<name> do ... question_page :<page> end` block per task per `<FORM_LAYOUT>`. See `tmp/strata-sdk/docs/multi-page-form-flows.md`. TDD: spec the flow exposes the expected tasks/pages → fail → implement → green → lint → commit.

2. Run the views generator:

   ```sh
   bin/rails generate strata:application_form_views <PROGRAM>ApplicationFormFlow <PROGRAM>ApplicationForm
   ```

   Outputs: `app/views/<program>_application_forms/edit_<page>.html.erb` per question page, `app/views/layouts/<program>_application_form.html.erb`, `config/locales/<program>_application_forms/en.yml`.

3. Hand-write the applicant controller — the flow gives you routes/actions, but the SDK does not generate the controller class itself. Drive every action in via TDD.

**14c. TDD around the applicant UI**, one behavior at a time. Open the relevant spec, strengthen it, watch it fail, edit until green, then `make lint`:

- `GET` form entry → 200 for authed user, redirect otherwise
- `POST` valid → record created, `status: 'in_progress'`, `user_id` populated
- `POST` invalid → re-render with errors
- Each `<VALIDATIONS>` rule fires on invalid input (presence, format, numericality)
- Submit action → `status` transitions to `submitted`, `submitted_at` set
- Post-submit edit attempt → blocked by `prevent_changes_if_submitted`
- `<POST_SUBMIT>` behavior matches the chosen option
- `<RETURN_BEHAVIOR>` matches the chosen option
- `<ENTRY_POINT>` reaches the form per the chosen option
- **Attribute coverage — single-page** (when `<FORM_LAYOUT>` is `single`): for each attribute in `<ATTRS>`, a system spec asserts an input field with matching name/label exists in `GET <form>/new`. If a generated spec doesn't cover an attribute, add an example and watch it fail before editing the view.
- **Attribute coverage — multi-page** (when `<FORM_LAYOUT>` is task map): per task, system spec asserts only that task's question_pages render, no fields from other tasks. Separate spec confirms union of all tasks equals `<ATTRS>` — no attribute missing across the flow.
- Multi-page only: back/next navigation works; skipping a required page redirects correctly.

Show route diffs and view edits to the user before saving.

If a generated spec passes immediately without any code edit, the spec is too weak — strengthen it before moving on.

## Step 15: Verify

```sh
make lint
make test
```

Both must pass. If either fails, stop and report — do not move to Step 16.

## Step 16: Report

Confirm `make lint` and `make test` both passed in the current message before reporting — see [`references/verification.md`](references/verification.md).

> **Application form ready.** Run `make start-container` and visit the entry point. Application form model: `app/models/strata/<program>_application_form.rb`. Case model: `app/models/strata/<program>_case.rb`. Business process: `app/business_processes/<program>_business_process.rb`. Staff dashboard: `/staff/<program>_cases`. Applicant entry: per `<ENTRY_POINT>`. Plan: `docs/<app-type>-application-form-plan.md`. SDK reference: `tmp/strata-sdk/docs/`. Re-run `git -C tmp/strata-sdk pull` after upgrading the gem to keep docs in sync.

## Common pitfalls

| Problem | Fix |
|---------|-----|
| `bin/rails generate strata:...` says command not found | Gem not installed — re-run `bundle install` |
| Model extends `ApplicationRecord` instead of `Strata::ApplicationForm` | Edit model file, re-run tests |
| Migration missing `status` / `user_id` / `submitted_at` | These are auto-injected by `strata:application_form` base attrs — if missing, re-run the AF generator (don't hand-craft `strata:migration`) |
| Duplicate migration error after generation | Likely re-ran `strata:migration` after `strata:application_form` — delete the duplicate; the AF generator already wrote one |
| App form model has spurious `case_id` column or `belongs_to :case` | Wrong direction — Case has `application_form_id` and `belongs_to :application_form`. Drop the column/association from the form |
| Looked for BP in `app/models/` and found nothing | BPs live at `app/business_processes/<name>_business_process.rb` |
| `strata:case` produced views/routes but applicant cannot reach the form | Those are STAFF views under `/staff`. Build the applicant surface separately via `bin/rails generate scaffold` (single page) or flow + `strata:application_form_views` (multi-page) |
| `strata:application_form_views` errors "flow not found" | The flow class is hand-written — it does not exist until you create `app/flows/<program>_application_form_flow.rb` |
| BP `--application_form` flag (underscore) ignored | SDK USAGE doc has typo; actual class_option is `--application-form` (hyphen) |
| Clone fails with auth error | Repo is public — check network, proxy, or VPN settings |
| Doc file not found in `tmp/strata-sdk/docs/` | Run `ls tmp/strata-sdk/` to find actual doc layout; adapt paths |
| SDK docs conflict with this skill | Docs win — they reflect the installed gem version |

## Reference

- Strata SDK Rails (gem): https://github.com/navapbc/strata-sdk-rails
- Local clone after Step 3: `tmp/strata-sdk/docs/`
- Build plan: `<RAILS_DIR>/docs/<app-type>-application-form-plan.md`
