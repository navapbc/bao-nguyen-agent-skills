---
name: build-strata-application-form
description: Adds a Strata SDK application form to a scaffolded Strata Rails app. Use when extending a Strata Rails project with a government intake form (unemployment, SNAP, Medicaid, etc.) via the strata_sdk_rails gem.
---

# Build Strata Application Form

## Overview

Extends an existing Strata Rails app (typically scaffolded by the `build-strata-rails-app` skill) with a Strata SDK application form. Installs the `strata_sdk_rails` gem, generates agent rules, generates the form model + migration + views, and wires up an entry point chosen by the user.

**Scope (currently):** application forms only. Other Strata features (cases, business processes, tasks) are out of scope for this skill.

**TDD is mandatory.** Every step that produces or modifies Ruby code (model, migration, controller, views, routes) must follow the `test-driven-development` skill: write a failing RSpec spec, run `make test` to watch it fail, write minimal Ruby, run `make test` to watch it pass, then `make lint`. Generator output (model stubs, migration stubs, scaffold view specs) is NOT a substitute — replace generator-stub specs with real failing specs before adding behavior. See [`references/test-driven-development.md`](references/test-driven-development.md).

**Before reporting completion**, follow the verification reference: [`references/verification.md`](references/verification.md).

## Step 1: Confirm intent

Ask the user exactly this:

> **Are you building a government application/intake form (e.g. unemployment, SNAP, Medicaid)? (reply "skip" to exit, otherwise say yes)**

- Reply declines / "skip" / "no" → stop. Do not run any commands.
- Reply confirms → tell the user the Strata SDK is a good fit for this and proceed.

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

Suggest a starting set appropriate for `<APP_TYPE>` using common Strata attribute types (the generated rule file will be cross-checked in Step 10). Common starter set:

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

**3c. All subsequent commands** (Step 6 onward) **must run from inside `<RAILS_DIR>`**. Either `cd <RAILS_DIR>` once at the start of Step 6, or prefix each command (e.g. `cd <RAILS_DIR> && bundle install`). Edits to `Gemfile`, `config/routes.rb`, models, views, etc. all target paths under `<RAILS_DIR>`.

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

## Step 6: Ask which AI coding agent

Ask:

> **Which AI coding agent are you using? (claude / cursor / copilot / other)**

Map answer to a `--agent` flag:

| Answer | Flag | Rules dir |
|--------|------|-----------|
| claude | `--agent claude` | `.claude/rules/strata-sdk/` |
| cursor | `--agent cursor` | `.cursor/rules/strata-sdk/` |
| copilot | `--agent copilot` | `.copilot/rules/strata-sdk/` |
| other / unsure | *(omit flag)* | `.agents/rules/strata-sdk/` |

Save the chosen flag as `<AGENT_FLAG>` (may be empty) and the rules dir as `<RULES_DIR>`.

## Step 7: Verify Ruby version matches the project

Before installing any gems, confirm the active Ruby matches what the project requires. Mismatched Ruby is a common cause of confusing `bundle install` failures.

**Follow the shared reference: [`references/ruby-version-check.md`](references/ruby-version-check.md)**.

It walks through:

- **A.** read `.ruby-version` / `Gemfile` / `.tool-versions` → `<REQUIRED_RUBY>`
- **B.** compare against `ruby -v`
- **C.** ask the user which version manager they use (rbenv / asdf / rvm / chruby / other)
- **D.** install the version if missing, then activate it (per-manager commands in the reference's table)
- **E.** verify `bundle -v`

Run all of `<RAILS_DIR>` paths in the reference relative to the directory chosen in Step 3. Do not proceed to Step 8 until `ruby -v` matches `<REQUIRED_RUBY>` and `bundle -v` succeeds.

## Step 8: Install the strata_sdk_rails gem

Add the gem to the `Gemfile` (idempotent — skip if already present):

```ruby
# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git"
```

**8a. Install locally:**

```sh
bundle install
```

If `bundle install` fails, stop and report the exact error.

**8b. Rebuild the Docker image** so the container has the new gem. Without this step, the next `bin/rails generate strata:...` invocation inside the container will fail with "command not found" or the gem will be missing.

```sh
make build
```

Stop and report on failure.

**8c. Verify the existing test suite still passes:**

```sh
make lint
make test
```

If `make test` regresses, the gem may conflict with an existing dependency. Stop and report. Do not move on with a broken baseline.

## Step 9: Generate SDK rules

Run the rules generator so the agent picks up Strata-specific guidance:

```sh
bin/rails generate strata:rules all <AGENT_FLAG>
```

(Omit `<AGENT_FLAG>` if the user picked "other / unsure".)

After it succeeds, **read the generated `application_form` rule file** (e.g. `.claude/rules/strata-sdk/application_form.md`) before proceeding. The rule file is the authoritative recipe; the steps below defer to it when they conflict.

## Step 10: Validate against generated rules, then generate the model

**10a. Re-read the rule files generated in Step 9.** List and read every file under `<RULES_DIR>`:

```sh
ls <RULES_DIR>
```

At minimum, read:

- `<RULES_DIR>/application_form.md` — recipe for the form model
- Any rule file covering attributes / data modeling (commonly `strata_attributes.md` or `data_modeler.md`)
- Any rule file covering migrations

**10b. Cross-check `<ATTRS>` against the rules.** Verify every attribute type in `<ATTRS>` is listed in the rule file. If any type is unsupported, report to the user, propose a fix, update the plan doc, and re-confirm before proceeding.

**10c. Validate the proposed model + attributes against the rules:**

| Check | What to verify |
|-------|----------------|
| Form name | Matches naming convention the rule file requires |
| Parent class | Model must extend `Strata::ApplicationForm` |
| Attribute types | Every `<ATTRS>` entry uses a Strata type listed in the rules |
| Required base columns | `status`, `user_id`, `submitted_at` needed in migration |
| Attribute naming | snake_case, no reserved names |
| Other | Read rule file carefully — may require specific validations or callbacks |

**10d. If any check fails**, do not run the generator. Report the conflict, propose a fix, update the plan doc, and re-confirm with the user.

**10e. Write failing model specs FIRST (TDD).** Write RSpec specs under `spec/models/strata/<form_name>_spec.rb` covering at least:

- Extends `Strata::ApplicationForm`
- Each `<ATTRS>` entry is declared as the right Strata type
- Required-attribute validations the rule file specifies
- Status transitions (`in_progress` → `submitted`) and immutability after `submitted`

Run `make test` and confirm these specs **fail** (model doesn't exist yet). See [`references/test-driven-development.md`](references/test-driven-development.md) — do not skip the watch-it-fail step.

**10f. Generate the model:**

```sh
bin/rails generate strata:application_form <FormName> <ATTRS>
```

Example:

```sh
bin/rails generate strata:application_form SnapApplicationForm name:name birth_date:memorable_date residential_address:address household_size:integer
```

**10g. Verify and finish the model.** Open `app/models/strata/<form_name>.rb`:

- Extends `Strata::ApplicationForm` (not `ApplicationRecord`) — fix if not.
- Each attribute uses `strata_attribute :<name>, :<type>` per the rule file.
- Add any rule-mandated validations, scopes, associations the generator didn't add.

If the generator created stub specs, replace or fold them into the specs from 10e. Run `make test` until the specs from 10e pass, then `make lint`. Do not move on while either fails.

## Step 11: Generate and run the migration

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

## Step 12: Generate views and wire up the entry point (TDD)

Follow the **generated `application_form` rule file's recipe** for views (controllers, views, routes). Apply TDD throughout — see [`references/test-driven-development.md`](references/test-driven-development.md).

**12a. Write failing request and system specs FIRST.** Cover at least:

- `GET <form>/new` returns 200 for an authenticated user, redirects/denies otherwise
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

Run `make test` — confirm all of the above **fail** for the right reasons (route missing, controller missing, link absent).

**12b. Implement minimum to pass each spec, one at a time:**

1. Generate or hand-write the controller + views per the rule file (prefer the SDK scaffold generator if available).
2. Add the route in `config/routes.rb`.
3. Wire the entry point per `<ENTRY_POINT>`.
4. Implement post-submit behavior per `<POST_SUBMIT>`.
5. Implement return navigation per `<RETURN_BEHAVIOR>`.

Show route changes and view edits to the user before saving.

**12c. After each pass, run:**

```sh
make test
make lint
```

Both must be green before moving to the next spec. If a spec passes immediately without an implementation change, the spec is wrong — rewrite it.

## Step 13: Verify

```sh
make lint
make test
```

If either fails, stop and report.

## Step 14: Report

Before reporting, follow [`references/verification.md`](references/verification.md) to confirm `make lint` and `make test` both passed in the current message.

> **Application form ready.** Run `make start-container` (or the project's normal start command) and visit the entry point you chose. The form lives at `app/models/strata/<form_name>.rb`. The build plan is at `docs/<app-type>-application-form-plan.md`. Rule files are at `<RULES_DIR>` — re-run the rules generator after upgrading the gem.

## Common pitfalls

| Problem | Fix |
|---------|-----|
| `bin/rails generate strata:...` says command not found | Gem not installed — re-run `bundle install` |
| Model extends `ApplicationRecord` instead of `Strata::ApplicationForm` | Edit the model file, re-run tests |
| Migration missing `status` / `user_id` / `submitted_at` | Re-generate the migration with the base columns included |
| User picked an agent not in the table | Use `--agent <answer>` if the gem supports it; otherwise omit the flag and use `.agents/rules/strata-sdk/` |
| Rule file recipe conflicts with this skill | Rule file wins — it reflects the installed gem version |

## Reference

- Strata SDK Rails (gem): https://github.com/navapbc/strata-sdk-rails
- Intake application forms guide: `docs/intake-application-forms.md` in the gem repo
- Strata attribute types: `docs/strata-attributes.md` in the gem repo
- Rules generator: `bin/rails generate strata:rules --help`
- Build plan: `<RAILS_DIR>/docs/<app-type>-application-form-plan.md`
