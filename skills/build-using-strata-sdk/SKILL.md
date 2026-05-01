---
name: build-using-strata-sdk
description: Adds a Strata SDK application form to a scaffolded Strata Rails app by cloning the SDK repo locally for reference. Use when extending a Strata Rails project with a government intake form via the strata_sdk_rails gem.
---

# Build Using Strata SDK

## Overview

Extends an existing Strata Rails app (typically scaffolded by `build-strata-rails-app`) with a Strata SDK application form. Clone the SDK locally, plan the form against its actual generators and attribute catalog, drive the SDK's generators to produce model + specs + migration + controller + views, then TDD every change made on top of generator output.

**Scope:** application forms, their associated cases, and the business processes that govern them. Tasks are surfaced during planning but built elsewhere.

**SDK knowledge** (docs map, generators, domain model, UI surfaces, multi-page flows, Pundit policies, plan validation checklist, pitfalls): [`references/strata-sdk.md`](references/strata-sdk.md). Read it before planning; consult it whenever a question about SDK behavior arises.

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

Clone the SDK into `tmp/strata-sdk/` inside `<RAILS_DIR>` so docs, generators, and source are readable without network access for the rest of the skill.

```sh
git clone --depth 1 https://github.com/navapbc/strata-sdk-rails.git tmp/strata-sdk
```

If clone fails (network, auth, proxy/VPN), stop and report — do not proceed without local docs.

Append `/tmp/strata-sdk/` to `<RAILS_DIR>/.gitignore` if not already present.

## Step 4: Read the SDK reference

Open [`references/strata-sdk.md`](references/strata-sdk.md) and read sections 1–6 end-to-end. That file is the single source of truth for: docs catalog, generators inventory, domain model (relations, status lifecycle, attribute types), the two UI surfaces (staff vs applicant), multi-page flow controller, and Pundit policies.

Verify the clone matches what the reference describes:

```sh
ls tmp/strata-sdk/docs/
ls tmp/strata-sdk/lib/generators/strata/
```

If a doc is missing or the generator inventory is empty, stop and tell the user the SDK clone is incomplete — re-clone or pin to a tag with the expected layout.

## Step 5: Planning Phase (SDK-informed)

Use the reference throughout. Every question below should already include the SDK's defaults so the user can simply confirm. Assume the user is **not** an expert on Strata application forms — explain each concept in one line before asking.

Ask each question in sequence — wait for an answer before asking the next. Iterate until the user confirms.

**5a. Application type and form name**

> A Strata application form is a Rails model that extends `Strata::ApplicationForm` and represents one applicant's submission. **What program is this form for?** (e.g. unemployment benefits, SNAP, Medicaid, housing assistance, passport, business license, appeal, other)

Derive `<PROGRAM>` (the bare program name, e.g. `Unemployment`, `Passport`). The SDK's `strata:application_form` and `strata:case` generators **auto-suffix** `ApplicationForm` and `Case` — pass the bare program name. Save `<PROGRAM>` and `<APP_TYPE>`. Final class names: `<PROGRAM>ApplicationForm`, `<PROGRAM>Case`, `<PROGRAM>BusinessProcess`.

**5b. Attribute selection — propose SDK-supported defaults**

> Each piece of data the form collects is a **Strata attribute** with a typed widget (e.g. `name`, `address`, `tax_id`, `memorable_date`, `money`). I'll suggest a starter set based on the SDK's catalog and `<APP_TYPE>`, then we'll refine it together. For fields the SDK doesn't cover (such as `email` or `phone`), we'll use standard Rails types.

Propose a starter set from `tmp/strata-sdk/docs/strata-attributes.md`. Common base:

| Attribute | Strata type | Why |
|-----------|-------------|-----|
| `name` | `name` | Applicant full name |
| `birth_date` | `memorable_date` | DOB |
| `residential_address` | `address` | Mailing/residential |
| `email` | `string` (Rails primitive) | Contact |
| `phone` | `string` (Rails primitive) | Contact |

Tailor by program (only if SDK supports the type):

- **Unemployment:** last employer, last day worked, reason for separation, weekly earnings
- **SNAP:** household size, monthly income, household members, expenses
- **Medicaid:** household size, income, citizenship status, disability status

Ask:

> **Confirm this attribute list, or tell me what to add/remove. (yes / edit)**

Save `<ATTRS>` as `name:type` pairs separated by spaces. Note primitive-type attributes in the plan — they won't get a Strata widget and need a plain form field.

**5c. Attribute validations**

> Each attribute can have Rails validations. Based on the attributes you chose, I'll propose sensible defaults — confirm or edit.

Propose defaults:

- Contact/identity (`name`, `email`, `phone`) → `presence: true`
- `email` → format
- `phone` → format
- Numeric (income, household size) → `numericality: { greater_than: 0 }`
- Date fields → `presence: true` if required

Ask:

> **Confirm these validations, or tell me what to add/remove. (yes / edit)**

Save as `<VALIDATIONS>` map (`attr_name: [validation_list]`). TDD in Step 14 drives them.

**5d. Form layout — single page or multi-page flow**

> Application forms can be a single scrollable page or split into multiple pages. The SDK's preferred multi-page pattern is `Strata::Flows::ApplicationFormFlow` (DSL of `task :group { question_page :field }`), with one question per page by default. **How should this form work?**
>
> 1. Single page — all fields on one screen, one Submit button (use `bin/rails generate scaffold`)
> 2. Multi-page flow — fields split into tasks/pages using the flow DSL + `strata:application_form_views`

If multi-page: ask number of tasks, task names, and which `<ATTRS>` are question pages under each task. Allow grouped pages where it improves UX.

Save as `<FORM_LAYOUT>` — either `single` or an ordered map `task_name: [question_pages]`.

**5e. Entry point**

> After sign-in, how should the user reach this form?
>
> 1. Landing page after login
> 2. Link or card on an existing dashboard
> 3. Button on a specific page (which one?)
> 4. Other (describe)

Save as `<ENTRY_POINT>`.

**5f. Post-submission behavior**

> When the user clicks Submit, the form transitions to `status: 'submitted'` and becomes immutable. **What should the user see immediately after?**
>
> 1. Confirmation/review page (read-only) showing every value entered
> 2. Redirect to dashboard with a success flash
> 3. Other (describe)

Save as `<POST_SUBMIT>`.

**5g. Return navigation**

> If the user comes back later, the form is locked. **What should they see when they revisit the entry point?**
>
> 1. Submitted application read-only
> 2. Blank form to start a new application
> 3. List of all their submitted applications
> 4. Other (describe)

Save as `<RETURN_BEHAVIOR>`.

**5h. Case and business process — required wiring**

> Application forms must be tied to a **case** (one applicant's program instance), governed by a **business process** (the workflow rules).

**i.** Check `app/business_processes/` for an existing BP. If found, confirm; else default to `<PROGRAM>BusinessProcess`. Save `<BUSINESS_PROCESS_NAME>`, `<BUSINESS_PROCESS_EXISTS>`.

**ii.** Check `app/models/strata/` for an existing case. If found, confirm; else default to `<PROGRAM>Case`. Save `<CASE_NAME>`, `<CASE_EXISTS>`.

**iii.** On submit: create a new case or attach to an existing one? Save `<CASE_TRIGGER>` (`create_new` / `attach_existing`).


Re-prompt 5b/5c if any answer changes the attribute list.

## Step 6: Write the plan

Follow [`references/writing-plans.md`](references/writing-plans.md). Save to `<RAILS_DIR>/docs/<app-type>-application-form-plan.md`. Header must list:

- `<APP_TYPE>` → `<FORM_NAME>`
- `<ATTRS>` table (type + reason; flag primitives)
- `<VALIDATIONS>` table
- `<FORM_LAYOUT>`, `<ENTRY_POINT>`, `<POST_SUBMIT>`, `<RETURN_BEHAVIOR>`
- `<BUSINESS_PROCESS_NAME>`, `<CASE_NAME>`, `<CASE_TRIGGER>`
- Generators per artifact: `strata:application_form` for the model + migration; applicant controller and views generated separately (before the case); `strata:case` for the case model + staff dashboard + business process. We use a domain-driven philosophy where AF and Case have NO Rails relationships; they link via queries.
- Pundit policy + spec + per-page system spec for the form (see Section 6 of the SDK reference)
- Out-of-scope items (tasks) listed but not built

Tell the user:

> Plan written to `docs/<app-type>-application-form-plan.md`. Reply **confirm** to begin, or describe changes and I'll update the plan.

Iterate until the user confirms.

## Step 7: Re-validate the plan against the SDK

Walk the confirmed plan against the checklist in [`references/strata-sdk.md`](references/strata-sdk.md) Section 7 ("Plan validation checklist"). If any check fails, update the plan, re-confirm with the user, and repeat. Do not proceed to Step 8 until every check passes.

## Step 8: Verify Ruby version matches the project

Follow [`references/ruby-version-check.md`](references/ruby-version-check.md). Do not proceed until `ruby -v` matches the project's required version and `bundle -v` succeeds.

## Step 9: Install the strata_sdk_rails gem

Add to the `Gemfile` (idempotent — skip if already present):

```ruby
# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git"
```

**9a.** `bundle install`. Stop and report on failure.

**9b. Rebuild the Docker image** so the container has the new gem:

```sh
make build
make precompile-assets
```

Stop and report on failure. (`make precompile-assets` compiles front-end assets inside the container — skipping it causes asset failures in 9c.)

**9c. Verify the existing test suite still passes:**

```sh
make lint
make test
```

If `make test` regresses, the gem may conflict with an existing dependency. Stop and report.

## Step 10: Check what already exists

```sh
find app/models/strata -type f -name "*case*.rb" 2>/dev/null
find app/business_processes -type f -name "*business_process*.rb" 2>/dev/null
find app/models/strata -type f -name "*application_form*.rb" 2>/dev/null
```

Set `<CASE_EXISTS>`, `<BUSINESS_PROCESS_EXISTS>`, `<FORM_EXISTS>`. If user said something exists but grep finds nothing, stop and re-confirm.

## Step 11: Generate Application Form

We follow a domain-driven philosophy: Application Form and Case models have NO Rails relationships (`belongs_to`/`has_many`). They are linked via queries. The Application Form must be created first.

**11a. Run the application form generator:**

```sh
bin/rails generate strata:application_form <PROGRAM> <ATTRS>
```

This produces the model at `app/models/strata/<program>_application_form.rb` and a migration with base attributes (`user_id`, `status`, `submitted_at`).

**11b. Run migrations:** `bin/rails db:migrate`

Migrations must run before generating controller/views — the multi-page views generator (`strata:application_form_views`) `constantize`s the model and inspects `attribute_types` and `columns_hash`, which require the migration to have run.

**11c. Generate the application form controller and views:**

Follow Step 12 to generate the controller and views for the application form now, before proceeding to the case.

## Step 12: Generate Controller and Views

The controller serves as the endpoints for serving the views for the application form.

**12a. Single-page layout** (when `<FORM_LAYOUT>` is `single`):

```sh
bin/rails generate scaffold <PROGRAM>ApplicationForm <ATTRS> --skip-migration --model-name=<PROGRAM>ApplicationForm
```

`--skip-migration` is mandatory — the migration already exists from Step 11.

**12b. Multi-page layout** (when `<FORM_LAYOUT>` is a task map):

1. Hand-write the flow class at `app/flows/<program>_application_form_flow.rb`.
2. Run the views generator:

   ```sh
   bin/rails generate strata:application_form_views <PROGRAM>ApplicationFormFlow <PROGRAM>ApplicationForm
   ```

3. Hand-write the applicant controller (see Section 6 of the SDK reference).

## Step 13: Generate Case

**13a. Run the case generator:**

The SDK's `strata:case` generator produces the case model, staff dashboard, and business process.

```sh
bin/rails generate strata:case <PROGRAM> --business-process <PROGRAM>BusinessProcess --skip-application-form
```

Since the Application Form already exists, we use `--skip-application-form`. Case base attrs (`application_form_id:uuid`, `status:integer`, `business_process_current_step:string`, `facts:jsonb`) are auto-injected — do not pass them to the generator. The `application_form_id` is used for query-based lookups, NOT as a Rails relationship.

**13b. Run migrations:** `bin/rails db:migrate`

**13c. Verify:** `make test && make lint`.

## Step 14: TDD-strengthen the generated application form model

The application form model and its baseline spec are generator output. Per [`references/test-driven-development.md`](references/test-driven-development.md), generator output may exist without a failing test first, but **every change from here is test-first**.

**14a. Re-read** Section 3 ("Domain model") of [`references/strata-sdk.md`](references/strata-sdk.md) and `tmp/strata-sdk/app/models/strata/application_form.rb` to confirm what `Strata::ApplicationForm` already provides.

**14b. TDD loop** for each behavior the plan requires:

1. Open `spec/models/strata/<program>_application_form_spec.rb`.
2. Add or strengthen an example: each `<ATTRS>` declared with the correct `strata_attribute :name, :type`; each `<VALIDATIONS>` rule fires; submitting transitions `status` to `submitted`; post-submit edits raise.
3. `make test` → watch fail for the right reason.
4. Edit `app/models/strata/<program>_application_form.rb` until green.
5. `make test` green → `make lint` green.
6. Commit before next behavior.

**Do NOT** add `belongs_to :<case>` to the application form. If the generated model extends `ApplicationRecord` instead of `Strata::ApplicationForm`, fix it inside the TDD loop.

## Step 15: TDD-strengthen the case model and business process

**15a. Case model** (`app/models/strata/<program>_case.rb`): TDD loop to verify

- extends `Strata::Case`
- has a query-based lookup method for the application form (e.g., `def application_form; <PROGRAM>ApplicationForm.find(application_form_id); end`)
- `business_process` class method returns `<PROGRAM>BusinessProcess`

**15b. Business process** (`app/business_processes/<program>_business_process.rb`): TDD loop to define each step from the plan (`applicant_task`, `system_process`, `staff_task`, transitions). Spec → fail → implement → green → lint → commit.

**15c. Verify:** `make test && make lint` after each commit.

## Step 16: Wire Pundit authorization (TDD)

**Required before Step 17** — without a policy class, every applicant page raises `Pundit::NotDefinedError`. Follow Section 6 of [`references/strata-sdk.md`](references/strata-sdk.md) for full templates. TDD loops, in order: (1) ensure `pundit` + `pundit-matchers` (`:test`) in Gemfile and `app/policies/application_policy.rb` exists (`bin/rails g pundit:install` if not); (2) write the policy spec (four contexts), watch fail, create `<Program>ApplicationFormPolicy < ApplicationPolicy` with `include Strata::ApplicationFormPolicy`, watch green, lint, commit; (3) write a request spec sweeping every page in `Flows::<PROGRAM>ApplicationFormFlow.generated_routes` plus negative cases (non-owner, unauthenticated, submitted), watch fail, add `before_action :authenticate_user!` and `before_action :load_and_authorize_form, only: Flow.generated_routes` to the applicant controller (where `load_and_authorize_form` calls `authorize(<Program>ApplicationForm.find(params[:id]), :update?)` and assigns the ivar `flow_record` returns), watch green, commit. Single-page: skip the per-page sweep; assert `authorize(form, :update?)` fires on `edit`/`update`.

## Step 17: TDD-strengthen the applicant-facing form UI

Step 12 produced the applicant-facing form scaffolding. This step drives every UI behavior via TDD.

- `GET` form entry → 200 for authed user, redirect otherwise
- `POST` valid → record created, `status: 'in_progress'`, `user_id` populated
- `POST` invalid → re-render with errors
- Each `<VALIDATIONS>` rule fires on invalid input
- Submit action → `status` transitions to `submitted`, `submitted_at` set
- Post-submit edit attempt → blocked by `prevent_changes_if_submitted`
- `<POST_SUBMIT>`, `<RETURN_BEHAVIOR>`, `<ENTRY_POINT>` match the chosen options
- **Attribute coverage — single-page:** for each attribute in `<ATTRS>`, a system spec asserts an input field with matching name/label exists in `GET <form>/new`. If a generated spec doesn't cover an attribute, add an example and watch it fail before editing the view.
- **Attribute coverage — multi-page:** per task, system spec asserts only that task's question_pages render. Separate spec confirms union of all tasks equals `<ATTRS>`.
- **Multi-page only — per-page navigation system spec.** For each page in `Flow.generated_routes`: sign in as owner, GET `edit_<page>` → 200 (no Pundit errors), correct fields render, submit valid input → redirect to next page (or `end_path` on last). Negative cases: non-owner → `NotAuthorizedError`; unauthenticated → sign-in redirect; submitted form → forbidden. Also assert back/next navigation and that skipping a required page redirects via `enforce_task_dependencies`. Pundit errors → fix in Step 16 (never per-page policy methods).

If a generated spec passes immediately without any code edit, the spec is too weak — strengthen it before moving on. Show route diffs and view edits to the user before saving.

## Step 18: Verify

```sh
make lint
make test
```

Both must pass. If either fails, stop and report.

## Step 19: Report

Confirm `make lint` and `make test` both passed in the current message before reporting — see [`references/verification.md`](references/verification.md).

> **Application form ready.** Run `make start-container` and visit the entry point. Application form: `app/models/strata/<program>_application_form.rb`. Case: `app/models/strata/<program>_case.rb`. BP: `app/business_processes/<program>_business_process.rb`. Policy: `app/policies/<program>_application_form_policy.rb` (spec covers the form; per-page system spec covers every question page). Staff dashboard: `/staff/<program>_cases`. Applicant entry: per `<ENTRY_POINT>`. Plan: `docs/<app-type>-application-form-plan.md`. SDK reference: [`references/strata-sdk.md`](references/strata-sdk.md) + `tmp/strata-sdk/docs/`. Re-run `git -C tmp/strata-sdk pull` after upgrading the gem to keep the local clone in sync.

## Common skill-procedure pitfalls

For SDK pitfalls (auto-suffixing, generator chains, Pundit, view surfaces, etc.) see Section 8 of [`references/strata-sdk.md`](references/strata-sdk.md). The list below covers things specific to running this skill end-to-end.

| Problem | Fix |
|---------|-----|
| Skill ran from monorepo root, generators failed | Step 2 was skipped — locate `<RAILS_DIR>` and re-run from there |
| `make precompile-assets` skipped after gem install | Re-run before `make test` (Step 9b) — asset failures otherwise mask real regressions |
| Plan re-validation in Step 7 keeps failing on the same row | Update the plan and re-confirm with the user; do not proceed by ignoring a failing check |
| Generated spec passes on first run without a code edit | Spec is too weak — strengthen it (per `references/test-driven-development.md`) before moving on |

## Reference

- Strata SDK reference: [`references/strata-sdk.md`](references/strata-sdk.md)
- Strata SDK Rails (gem): https://github.com/navapbc/strata-sdk-rails
- Local clone after Step 3: `tmp/strata-sdk/docs/`
- Build plan: `<RAILS_DIR>/docs/<app-type>-application-form-plan.md`
