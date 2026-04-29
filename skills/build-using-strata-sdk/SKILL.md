---
name: build-using-strata-sdk
description: Adds a Strata SDK application form to a scaffolded Strata Rails app by cloning the SDK repo locally for reference instead of generating agent rules. Use when extending a Strata Rails project with a government intake form via the strata_sdk_rails gem.
---

# Build Using Strata SDK

## Overview

Extends an existing Strata Rails app (typically scaffolded by the `build-strata-rails-app` skill) with a Strata SDK application form. Installs the `strata_sdk_rails` gem, clones the SDK repository into `tmp/strata-sdk/` for local reference, generates the form model + migration + views, and wires up an entry point chosen by the user.

**Scope (currently):** application forms only. Other Strata features (cases, business processes, tasks) are out of scope for this skill.

**TDD is mandatory.** Every step that produces or modifies Ruby code must follow the `test-driven-development` skill: write a failing RSpec spec, run `make test` to watch it fail, write minimal Ruby, run `make test` to watch it pass, then `make lint`. See [`references/test-driven-development.md`](references/test-driven-development.md).

**Before reporting completion**, follow the verification reference: [`references/verification.md`](references/verification.md).

## Step 1: Confirm intent

Ask the user exactly this:

> **Are you building a government application/intake form (e.g. unemployment, SNAP, Medicaid)? (reply "skip" to exit, otherwise say yes)**

- Reply declines / "skip" / "no" → stop. Do not run any commands.
- Reply confirms → tell the user the Strata SDK is a good fit and proceed.

## Step 2: Planning Phase

Gather all design decisions before touching any code. Ask each question in sequence — wait for the answer before asking the next.

**2a. Application type**

> **What kind of application is this? (e.g. unemployment benefits, SNAP, Medicaid, housing assistance, passport, business license, appeal, other)**

Derive the model name from the answer:

| Type | Suggested form name |
|------|---------------------|
| Unemployment | `UnemploymentApplicationForm` |
| SNAP | `SnapApplicationForm` |
| Medicaid | `MedicaidApplicationForm` |
| Housing | `HousingApplicationForm` |
| Other | `<DomainName>ApplicationForm` |

Save as `<APP_TYPE>` and `<FORM_NAME>`.

**2b. Propose and confirm attributes**

Suggest a starting set appropriate for `<APP_TYPE>` using common Strata attribute types (the SDK docs will be cross-checked in Step 8). Common starter set:

| Attribute | Strata type | Notes |
|-----------|-------------|-------|
| `name` | `name` | Applicant full name |
| `birth_date` | `memorable_date` | DOB |
| `ssn` | `tax_id` | If program requires SSN |
| `residential_address` | `address` | Mailing/residential |
| `email` | `email` | Contact |
| `phone` | `phone` | Contact |

Tailor by program (confirm with the user, do not invent silently):

- **Unemployment:** last employer, last day worked, reason for separation, weekly earnings
- **SNAP:** household size, monthly income, household members, expenses
- **Medicaid:** household size, income, citizenship status, disability status

Iterate until the user confirms:

> **Confirm this attribute list? (yes / edit)**

Save the final list as `<ATTRS>` formatted as `name:strata_type` pairs separated by spaces.

**2c. Entry point**

> **How will users reach this form after they log in?**
>
> 1. Landing page after login (root for authenticated users)
> 2. Link or card on an existing dashboard
> 3. Button on a specific page (which one?)
> 4. Other (describe)

Save as `<ENTRY_POINT>`.

**2d. Post-submission behavior**

> **What should happen immediately after the user submits the form?**
>
> 1. Show a confirmation/review page with all the details they entered
> 2. Redirect to the dashboard with a success message
> 3. Other (describe)

Save as `<POST_SUBMIT>`.

**2e. Return navigation**

> **If the user navigates back to the landing page or dashboard after submitting, what should they see?**
>
> 1. Their existing submitted application (read-only view)
> 2. A form to submit a new application
> 3. A list of all their existing applications
> 4. Other (describe)

Save as `<RETURN_BEHAVIOR>`.

## Step 3: Locate the Rails app directory

The project may be a monorepo — the Rails app likely lives in a subdirectory (e.g. `apps/<app_name>/`, `<app_name>/`), not necessarily the current working directory. Find it before doing anything else.

**3a. Check if cwd is already the Rails app:**

```sh
test -f Gemfile && test -f bin/rails && grep -q "rails" Gemfile
```

- All checks pass → cwd is the Rails app. Save `<RAILS_DIR>=.` and proceed to Step 4.
- Any check fails → continue to 3b.

**3b. Search for Rails app directories under cwd (depth ≤ 3):**

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

**3c. All subsequent commands** (Step 6 onward) **must run from inside `<RAILS_DIR>`**. Run all `<RAILS_DIR>` paths in `references/ruby-version-check.md` relative to the directory chosen in Step 3.

## Step 4: Write the plan document

Create `<RAILS_DIR>/docs/` if it doesn't exist. Write `<RAILS_DIR>/docs/<app-type>-application-form-plan.md` using the decisions captured in Step 2:

```markdown
# <APP_TYPE> Application Form — Build Plan

## Application Type
<APP_TYPE> → model: `<FORM_NAME>`

## Attributes
| Attribute | Strata type | Notes |
|-----------|-------------|-------|
<rows from confirmed <ATTRS>>

## Entry Point
<ENTRY_POINT description>

## Post-Submission Behavior
<POST_SUBMIT description>

## Return Navigation
<RETURN_BEHAVIOR description>

## What Will Be Built
- Model: `app/models/strata/<form_name>.rb`
- Migration: base columns (`status`, `user_id`, `submitted_at`) + attributes above
- Controller + views for the form
- Entry point wired per selection above
- Post-submit flow per selection above
- Return navigation per selection above
```

## Step 5: User confirms plan

Tell the user:

> Plan written to `docs/<app-type>-application-form-plan.md`. Please review it and reply **confirm** to begin building, or describe any changes and I'll update the plan first.

If the user requests changes: update the plan file and re-prompt. Only proceed once the user confirms.

## Step 6: Verify Ruby version matches the project

Before installing any gems, confirm the active Ruby matches what the project requires. Mismatched Ruby is a common cause of confusing `bundle install` failures.

**Follow the shared reference: [`references/ruby-version-check.md`](references/ruby-version-check.md)**.

It walks through:

- **A.** read `.ruby-version` / `Gemfile` / `.tool-versions` → `<REQUIRED_RUBY>`
- **B.** compare against `ruby -v`
- **C.** ask the user which version manager they use (rbenv / asdf / rvm / chruby / other)
- **D.** install the version if missing, then activate it
- **E.** verify `bundle -v`

Do not proceed to Step 7 until `ruby -v` matches `<REQUIRED_RUBY>` and `bundle -v` succeeds.

## Step 7: Install the strata_sdk_rails gem

Add the gem to the `Gemfile` (idempotent — skip if already present):

```ruby
# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git"
```

**7a. Install locally:**

```sh
bundle install
```

If `bundle install` fails, stop and report the exact error.

**7b. Rebuild the Docker image** so the container has the new gem:

```sh
make build
```

Stop and report on failure.

**7c. Verify the existing test suite still passes:**

```sh
make lint
make test
```

If `make test` regresses, the gem may conflict with an existing dependency. Stop and report.

## Step 8: Clone the SDK repository for local reference

Clone the Strata SDK Rails repo into `tmp/strata-sdk/` inside `<RAILS_DIR>` so docs and source are readable without network access after this step.

```sh
git clone --depth 1 https://github.com/navapbc/strata-sdk-rails.git tmp/strata-sdk
```

If clone fails (no network, auth error, etc.), stop and report — do not proceed without local docs.

**8a. Ensure `tmp/strata-sdk/` is gitignored.** Append to `<RAILS_DIR>/.gitignore` if the line is not already present:

```
/tmp/strata-sdk/
```

**8b. Identify key doc files.** List what's available:

```sh
ls tmp/strata-sdk/docs/
```

At minimum, locate:

| What to find | Typical path inside clone |
|--------------|---------------------------|
| Application form guide | `docs/intake-application-forms.md` |
| Strata attribute types | `docs/strata-attributes.md` |
| Generator reference | `lib/generators/` or README |

Read each located file before proceeding. These are the authoritative recipe. If a doc conflicts with the steps below, the doc wins.

**8c. Cross-check `<ATTRS>` against `tmp/strata-sdk/docs/strata-attributes.md`.** Verify every attribute type in `<ATTRS>` is listed in the docs. If any type is unsupported, report to the user and propose a fix. Update the plan doc if attributes change, then re-confirm with the user before proceeding.

## Step 9: Validate against SDK docs, then generate the model

**9a. Re-read the SDK docs from the clone** before invoking any generator:

- `tmp/strata-sdk/docs/intake-application-forms.md`
- `tmp/strata-sdk/docs/strata-attributes.md`
- Any migration-related doc in `tmp/strata-sdk/docs/`

**9b. Validate the proposed model + attributes against the docs:**

| Check | What to verify |
|-------|----------------|
| Form name | Matches naming convention the docs require |
| Parent class | Model must extend `Strata::ApplicationForm` |
| Attribute types | Every `<ATTRS>` entry uses a Strata type listed in the docs |
| Required base columns | `status`, `user_id`, `submitted_at` needed in migration |
| Attribute naming | snake_case, no reserved names |

**9c. If any check fails**, do not run the generator. Report the conflict, propose a fix, update the plan doc, and re-confirm with the user.

**9d. Write failing model specs FIRST (TDD).** Write RSpec specs under `spec/models/strata/<form_name>_spec.rb` covering at least:

- Extends `Strata::ApplicationForm`
- Each `<ATTRS>` entry is declared as the right Strata type
- Required-attribute validations the docs specify
- Status transitions (`in_progress` → `submitted`) and immutability after `submitted`

Run `make test` and confirm these specs **fail** (model doesn't exist yet). See [`references/test-driven-development.md`](references/test-driven-development.md).

**9e. Generate the model:**

```sh
bin/rails generate strata:application_form <FormName> <ATTRS>
```

**9f. Verify and finish the model.** Open `app/models/strata/<form_name>.rb`:

- Extends `Strata::ApplicationForm` (not `ApplicationRecord`) — fix if not.
- Each attribute uses `strata_attribute :<name>, :<type>` per the docs.
- Add any doc-mandated validations, scopes, associations the generator didn't add.

If the generator created stub specs, replace or fold them into the specs from 9d. Run `make test` until the specs from 9d pass, then `make lint`.

## Step 10: Generate and run the migration

```sh
bin/rails generate strata:migration status:integer user_id:uuid submitted_at:datetime <ATTRS>
```

Then:

```sh
bin/rails db:migrate
```

If the migration fails, stop and report.

**TDD checkpoint:**

```sh
make test
make lint
```

If specs that previously passed now fail because of the migration, fix the migration — do not weaken the specs.

## Step 11: Generate views and wire up the entry point (TDD)

Follow the SDK docs' recipe for views (controllers, views, routes). Apply TDD throughout — see [`references/test-driven-development.md`](references/test-driven-development.md).

**11a. Write failing request and system specs FIRST.** Cover at least:

- `GET <form>/new` returns 200 for authenticated user, redirects otherwise
- `POST <form>` with valid `<ATTRS>` creates a record with `status: 'in_progress'`
- `POST <form>` with invalid params re-renders the form and shows the error
- Post-submit behavior per `<POST_SUBMIT>`:
  - **Option 1 (confirmation page):** redirect to a review page showing submitted details
  - **Option 2 (dashboard):** redirect to dashboard with a success flash message
  - **Option 3 (other):** mirrors what the user described
- Return navigation per `<RETURN_BEHAVIOR>`:
  - **Option 1 (read-only view):** landing/dashboard shows link to the existing submitted application
  - **Option 2 (new application):** landing/dashboard shows the new-form link even after prior submission
  - **Option 3 (list):** landing/dashboard shows a list of all submitted applications
  - **Option 4 (other):** mirrors what the user described
- Entry point per `<ENTRY_POINT>`:
  - **Option 1 (post-login landing):** after sign-in, user lands on the form
  - **Option 2 (dashboard link/card):** dashboard shows the link/card and clicking it reaches the form
  - **Option 3 (button on a page):** the named page shows the button and clicking it reaches the form
  - **Option 4 (other):** spec mirrors what the user described

Run `make test` — confirm all of the above **fail** for the right reasons.

**11b. Implement minimum to pass each spec, one at a time:**

1. Generate or hand-write the controller + views per the SDK docs (prefer the SDK scaffold generator if available).
2. Add the route in `config/routes.rb`.
3. Wire the entry point per `<ENTRY_POINT>`.
4. Implement post-submit behavior per `<POST_SUBMIT>`.
5. Implement return navigation per `<RETURN_BEHAVIOR>`.

Show route changes and view edits to the user before saving.

**11c. After each pass, run:**

```sh
make test
make lint
```

Both must be green before moving to the next spec. If a spec passes immediately without an implementation change, the spec is wrong — rewrite it.

## Step 12: Verify

```sh
make lint
make test
```

If either fails, stop and report.

## Step 13: Report

Before reporting, follow [`references/verification.md`](references/verification.md) to confirm `make lint` and `make test` both passed in the current message.

> **Application form ready.** Run `make start-container` and visit the entry point you chose. The form lives at `app/models/strata/<form_name>.rb`. The build plan is at `docs/<app-type>-application-form-plan.md`. SDK reference docs are at `tmp/strata-sdk/docs/` — re-run `git -C tmp/strata-sdk pull` after upgrading the gem to keep docs in sync.

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
- Local clone after Step 8: `tmp/strata-sdk/docs/`
- Build plan: `<RAILS_DIR>/docs/<app-type>-application-form-plan.md`
