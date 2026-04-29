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

**2c. All subsequent commands** in this skill (Step 4 onward) **must run from inside `<RAILS_DIR>`**. Run all `<RAILS_DIR>` paths in `references/ruby-version-check.md` relative to the directory chosen in Step 2.

## Step 3: Pick the feature

Tell the user the Strata SDK supports several features (application forms, cases, business processes, tasks, determinations) but this skill currently only helps with **application forms**. Confirm:

> **Build an application form? (yes / no)**

Only proceed on yes.

## Step 4: Verify Ruby version matches the project

Before installing any gems, confirm the active Ruby matches what the project requires. Mismatched Ruby is a common cause of confusing `bundle install` failures.

**Follow the shared reference: [`references/ruby-version-check.md`](references/ruby-version-check.md)**.

It walks through:

- **A.** read `.ruby-version` / `Gemfile` / `.tool-versions` → `<REQUIRED_RUBY>`
- **B.** compare against `ruby -v`
- **C.** ask the user which version manager they use (rbenv / asdf / rvm / chruby / other)
- **D.** install the version if missing, then activate it
- **E.** verify `bundle -v`

Do not proceed to Step 5 until `ruby -v` matches `<REQUIRED_RUBY>` and `bundle -v` succeeds.

## Step 5: Install the strata_sdk_rails gem

Add the gem to the `Gemfile` (idempotent — skip if already present):

```ruby
# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git"
```

**5a. Install locally:**

```sh
bundle install
```

If `bundle install` fails, stop and report the exact error.

**5b. Rebuild the Docker image** so the container has the new gem:

```sh
make build
```

Stop and report on failure.

**5c. Verify the existing test suite still passes:**

```sh
make lint
make test
```

If `make test` regresses, the gem may conflict with an existing dependency. Stop and report.

## Step 6: Clone the SDK repository for local reference

Clone the Strata SDK Rails repo into `tmp/strata-sdk/` inside `<RAILS_DIR>` so docs and source are readable without network access after this step.

```sh
git clone --depth 1 https://github.com/navapbc/strata-sdk-rails.git tmp/strata-sdk
```

If clone fails (no network, auth error, etc.), stop and report — do not proceed without local docs.

**6a. Ensure `tmp/strata-sdk/` is gitignored.** Append to `<RAILS_DIR>/.gitignore` if the line is not already present:

```
/tmp/strata-sdk/
```

**6b. Identify key doc files.** List what's available:

```sh
ls tmp/strata-sdk/docs/
```

At minimum, locate:

| What to find | Typical path inside clone |
|--------------|---------------------------|
| Application form guide | `docs/intake-application-forms.md` |
| Strata attribute types | `docs/strata-attributes.md` |
| Generator reference | `lib/generators/` or README |

Read each located file before proceeding. These replace the generated agent rules used by the `build-strata-application-form` skill — treat them as the authoritative recipe. If a doc conflicts with the steps below, the doc wins.

## Step 7: Identify the application type

Ask:

> **What kind of application is this? (e.g. unemployment benefits, SNAP, Medicaid, housing assistance, passport, business license, appeal, other)**

Use the answer to drive the model name and attribute suggestions. Examples:

| Type | Suggested form name |
|------|---------------------|
| Unemployment | `UnemploymentApplicationForm` |
| SNAP | `SnapApplicationForm` |
| Medicaid | `MedicaidApplicationForm` |
| Housing | `HousingApplicationForm` |
| Other | `<DomainName>ApplicationForm` |

## Step 8: Propose attributes, iterate, confirm

Suggest a starting set of attributes appropriate for the application type using **Strata attribute types** from `tmp/strata-sdk/docs/strata-attributes.md`. Common starter set:

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

Go back and forth with the user until the attribute list is final, then ask:

> **Confirm this attribute list? (yes / edit)**

Only proceed on yes. Save the final list as `<ATTRS>` formatted as `name:strata_type` pairs separated by spaces.

## Step 9: Validate against SDK docs, then generate the model

**9a. Re-read the SDK docs from the clone** before invoking any generator. Read at minimum:

- `tmp/strata-sdk/docs/intake-application-forms.md` — recipe for the form model
- `tmp/strata-sdk/docs/strata-attributes.md` — attribute type reference
- Any migration-related doc in `tmp/strata-sdk/docs/`

**9b. Validate the proposed model + attributes against the docs.** Check at least:

| Check | What to verify |
|-------|----------------|
| Form name | Matches the naming convention the docs require (typically `<Domain>ApplicationForm`) |
| Parent class | Docs confirm model must extend `Strata::ApplicationForm` |
| Attribute types | Every attribute in `<ATTRS>` uses a Strata type listed in the docs — flag any unsupported |
| Required base columns | Docs confirm `status`, `user_id`, `submitted_at` are needed in migration |
| Attribute naming | snake_case, no reserved names |

**9c. If any check fails**, do not run the generator. Report the conflict to the user, propose a fix, and re-confirm. Loop back to Step 8 if attribute changes are needed.

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

Example:

```sh
bin/rails generate strata:application_form SnapApplicationForm name:name birth_date:memorable_date residential_address:address household_size:integer
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

**TDD checkpoint:** Run:

```sh
make test
make lint
```

If specs that previously passed now fail because of the migration, fix the migration — do not weaken the specs.

## Step 11: Ask how users reach the form (entry point)

> **How will users reach this form?**
>
> 1. Landing page after login (root for authenticated users)
> 2. Link or card on an existing dashboard
> 3. Button on a specific page (which one?)
> 4. Other (describe)

Save the answer as `<ENTRY_POINT>`.

## Step 12: Generate views and wire up the entry point (TDD)

Follow the SDK docs' recipe for views (controllers, views, routes). Apply TDD throughout — see [`references/test-driven-development.md`](references/test-driven-development.md).

**12a. Write failing request and system specs FIRST.** Cover at least:

- `GET <form>/new` returns 200 for authenticated user, redirects otherwise
- `POST <form>` with valid `<ATTRS>` creates a record with `status: 'in_progress'`
- `POST <form>` with invalid params re-renders the form and shows the error
- A system spec for `<ENTRY_POINT>`:
  - **Option 1 (post-login landing):** after sign-in, user lands on the form
  - **Option 2 (dashboard link/card):** dashboard shows the link/card and clicking it reaches the form
  - **Option 3 (button on a page):** the named page shows the button and clicking it reaches the form
  - **Option 4 (other):** spec mirrors what the user described

Run `make test` — confirm all of the above **fail** for the right reasons.

**12b. Implement minimum to pass each spec, one at a time:**

1. Generate or hand-write the controller + views per the SDK docs (the SDK may provide a scaffold-style generator — prefer it if so).
2. Add the route in `config/routes.rb`.
3. Wire the entry point per `<ENTRY_POINT>`:
   - **Option 1 (post-login landing):** point the authenticated root route at the new form's `new` action.
   - **Option 2 (dashboard link/card):** add a link or card on the existing dashboard view.
   - **Option 3 (button on a page):** add a button to the page the user named, linking to the form's `new` action.
   - **Option 4 (other):** implement what the user described, ask if unclear.

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

> **Application form ready.** Run `make start-container` and visit the entry point you chose. The form lives at `app/models/strata/<form_name>.rb`. SDK reference docs are at `tmp/strata-sdk/docs/` — re-run `git -C tmp/strata-sdk pull` after upgrading the gem to keep docs in sync.

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
- Local clone after Step 6: `tmp/strata-sdk/docs/`
