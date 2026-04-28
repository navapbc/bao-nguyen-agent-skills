---
name: build-strata-application-form
description: Adds a Strata SDK application form to a scaffolded Strata Rails app. Use when extending a Strata Rails project with a government intake form (unemployment, SNAP, Medicaid, etc.) via the strata_sdk_rails gem.
---

# Build Strata Application Form

## Overview

Extends an existing Strata Rails app (typically scaffolded by the `build-strata-rails-app` skill) with a Strata SDK application form. Installs the `strata_sdk_rails` gem, generates agent rules, generates the form model + migration + views, and wires up an entry point chosen by the user.

**Scope (currently):** application forms only. Other Strata features (cases, business processes, tasks) are out of scope for this skill.

**TDD is mandatory.** Every step that produces or modifies Ruby code (model, migration, controller, views, routes) must follow the `test-driven-development` skill: write a failing RSpec spec, run `make test` to watch it fail, write minimal Ruby, run `make test` to watch it pass, then `make lint`. Generator output (model stubs, migration stubs, scaffold view specs) is NOT a substitute — replace generator-stub specs with real failing specs before adding behavior. See [`references/test-driven-development.md`](../../references/test-driven-development.md).

## Step 1: Confirm intent

Ask the user exactly this:

> **Are you building a government application/intake form (e.g. unemployment, SNAP, Medicaid)? (reply "skip" to exit, otherwise say yes)**

- Reply declines / "skip" / "no" → stop. Do not run any commands.
- Reply confirms → tell the user the Strata SDK is a good fit for this and proceed.

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

**2c. All subsequent commands** in this skill (Step 5 onward) **must run from inside `<RAILS_DIR>`**. Either `cd <RAILS_DIR>` once at the start of Step 5, or prefix each command (e.g. `cd <RAILS_DIR> && bundle install`). Edits to `Gemfile`, `config/routes.rb`, models, views, etc. all target paths under `<RAILS_DIR>`.

## Step 3: Pick the feature

Tell the user the Strata SDK supports several features (application forms, cases, business processes, tasks, determinations) but this skill currently only helps with **application forms**. Confirm:

> **Build an application form? (yes / no)**

Only proceed on yes.

## Step 4: Ask which AI coding agent

Ask:

> **Which AI coding agent are you using? (claude / cursor / copilot / other)**

Map answer to a `--agent` flag:

| Answer | Flag | Rules dir |
|--------|------|-----------|
| claude | `--agent claude` | `.claude/rules/strata-sdk/` |
| cursor | `--agent cursor` | `.cursor/rules/strata-sdk/` |
| copilot | `--agent copilot` | `.copilot/rules/strata-sdk/` |
| other / unsure | *(omit flag)* | `.agents/rules/strata-sdk/` |

Save the chosen flag as `<AGENT_FLAG>` (may be empty).

## Step 5: Verify Ruby version matches the project

Before installing any gems, confirm the active Ruby matches what the project requires. Mismatched Ruby is a common cause of confusing `bundle install` failures.

**Follow the shared reference: [`references/ruby-version-check.md`](../../references/ruby-version-check.md)** (relative to the repo root of this skills repository).

It walks through:

- **A.** read `.ruby-version` / `Gemfile` / `.tool-versions` → `<REQUIRED_RUBY>`
- **B.** compare against `ruby -v`
- **C.** ask the user which version manager they use (rbenv / asdf / rvm / chruby / other)
- **D.** install the version if missing, then activate it (per-manager commands in the reference's table)
- **E.** verify `bundle -v`

Run all of `<RAILS_DIR>` paths in the reference relative to the directory chosen in Step 2. Do not proceed to Step 6 until `ruby -v` matches `<REQUIRED_RUBY>` and `bundle -v` succeeds.

## Step 6: Install the strata_sdk_rails gem

Add the gem to the `Gemfile` (idempotent — skip if already present):

```ruby
# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git"
```

**6a. Install locally:**

```sh
bundle install
```

If `bundle install` fails, stop and report the exact error.

**6b. Rebuild the Docker image so the container has the new gem.** `bundle install` only updates the host's `vendor/bundle` (or system gem path); the running container still has the old gem set. Without this step, the next `bin/rails generate strata:...` invocation inside the container will fail with "command not found" or the gem will be missing.

```sh
make build
```

Stop and report on failure.

**6c. Verify the existing test suite still passes** with the new gem installed (no behavior should have changed yet — only the dependency set):

```sh
make lint
make test
```

If `make test` regresses, the gem may conflict with an existing dependency. Stop and report. Do not move on with a broken baseline — every later step assumes a green starting point.

## Step 7: Generate SDK rules

Run the rules generator so the agent picks up Strata-specific guidance:

```sh
bin/rails generate strata:rules all <AGENT_FLAG>
```

(Omit `<AGENT_FLAG>` if the user picked "other / unsure".)

After it succeeds, **read the generated `application_form` rule file** (e.g. `.claude/rules/strata-sdk/application_form.md`) before proceeding. The rule file is the recipe for everything that follows; the steps below are a high-level guide and must defer to the rule file when they conflict.

## Step 8: Identify the application type

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

## Step 9: Propose attributes, iterate, confirm

Suggest a starting set of attributes appropriate for the application type, using **Strata attribute types** (see the rule file). Common starter set:

| Attribute | Strata type | Notes |
|-----------|-------------|-------|
| `name` | `name` | Applicant full name |
| `birth_date` | `memorable_date` | DOB |
| `ssn` | `tax_id` | If program requires SSN |
| `residential_address` | `address` | Mailing/residential |
| `email` | `email` | Contact |
| `phone` | `phone` | Contact |

Tailor by program (examples — confirm with the user, do not invent silently):

- **Unemployment:** last employer, last day worked, reason for separation, weekly earnings
- **SNAP:** household size, monthly income, household members, expenses
- **Medicaid:** household size, income, citizenship status, disability status

Go back and forth with the user until the attribute list is final, then ask:

> **Confirm this attribute list? (yes / edit)**

Only proceed on yes. Save the final list as `<ATTRS>` formatted as `name:strata_type` pairs separated by spaces.

## Step 10: Validate against generated rules, then generate the model

**10a. Re-read the rule files generated in Step 7** before invoking any generator. List and read every file under the rules dir chosen in Step 4:

```sh
ls <RULES_DIR>
```

At minimum, read:

- `<RULES_DIR>/application_form.md` — recipe for the form model
- Any rule file covering attributes / data modeling (commonly `strata_attributes.md`, `data_modeler.md`, or similar — names depend on the installed gem version)
- Any rule file covering migrations (commonly `migration.md` or `data_modeler.md`)

`<RULES_DIR>` is the agent dir from Step 4 (`.claude/rules/strata-sdk/`, `.cursor/rules/strata-sdk/`, `.copilot/rules/strata-sdk/`, or `.agents/rules/strata-sdk/`).

**10b. Validate the proposed model + attributes against the rules.** Check at least:

| Check | What to verify |
|-------|----------------|
| Form name | Matches the naming convention the rule file requires (typically `<Domain>ApplicationForm`) |
| Parent class | Rule file confirms model must extend `Strata::ApplicationForm` |
| Attribute types | Every attribute in `<ATTRS>` uses a Strata type listed in the rules (e.g. `name`, `memorable_date`, `tax_id`, `address`, `email`, `phone`, `integer`, etc.) — flag any that aren't supported |
| Required base columns | Rules confirm `status`, `user_id`, `submitted_at` are needed in the migration (used in Step 11) |
| Attribute naming | Matches conventions in the rule file (snake_case, no reserved names, etc.) |
| Anything else the rule file calls out | Read carefully — rules may require specific validations, callbacks, or associations |

**10c. If any check fails**, do not run the generator. Report the conflict to the user, propose a fix (rename attribute, swap type, drop unsupported attribute, etc.), and re-confirm:

> Rule `<rule_file>` requires `<X>` but the plan has `<Y>`. Change to `<proposal>`? (yes / edit)

Loop back to Step 9 if attribute changes are needed. Only proceed once every check passes.

**10d. Write failing model specs FIRST (TDD).** Before running the generator, write RSpec specs for the form model under `spec/models/strata/<form_name>_spec.rb` covering at least:

- Extends `Strata::ApplicationForm`
- Each `<ATTRS>` entry is declared as the right Strata type
- Required-attribute validations the rule file specifies
- Status transitions (`in_progress` → `submitted`) and the immutability rule (no edits after `submitted`)

Run `make test` and confirm these specs **fail** (model doesn't exist yet). See [`references/test-driven-development.md`](../../references/test-driven-development.md) — do not skip the watch-it-fail step.

**10e. Generate the model:**

```sh
bin/rails generate strata:application_form <FormName> <ATTRS>
```

Example:

```sh
bin/rails generate strata:application_form SnapApplicationForm name:name birth_date:memorable_date residential_address:address household_size:integer
```

**10f. Verify and finish the model.** Open `app/models/strata/<form_name>.rb`:

- Extends `Strata::ApplicationForm` (not `ApplicationRecord`) — fix if not.
- Each attribute uses `strata_attribute :<name>, :<type>` per the rule file.
- Add any rule-mandated validations, scopes, associations the generator didn't.

If the generator created stub specs, replace or fold them into the specs from 10d. Run `make test` until the specs from 10d pass, then `make lint`. Do not move on while either fails.

## Step 11: Generate and run the migration

The migration **must** include the `ApplicationForm` base columns plus the form's attributes:

```sh
bin/rails generate strata:migration status:integer user_id:uuid submitted_at:datetime <ATTRS>
```

Then:

```sh
bin/rails db:migrate
```

If the migration fails, stop and report.

**Re-run TDD checkpoint:** the model specs from Step 10d still need to pass against the now-migrated schema. Run:

```sh
make test
make lint
```

If specs that previously passed now fail because of the migration (missing column, wrong type, etc.), fix the migration — do not weaken the specs.

## Step 12: Ask how users reach the form (entry point)

Before generating views, ask:

> **How will users reach this form?**
>
> 1. Landing page after login (root for authenticated users)
> 2. Link or card on an existing dashboard
> 3. Button on a specific page (which one?)
> 4. Other (describe)

Save the answer as `<ENTRY_POINT>`. Do not invent — if the user is unclear, ask follow-ups.

## Step 13: Generate views and wire up the entry point (TDD)

Follow the **generated `application_form` rule file's recipe** for views (controllers, views, routes). Apply TDD throughout — see [`references/test-driven-development.md`](../../references/test-driven-development.md).

**13a. Write failing request and system specs FIRST.** Cover at least:

- `GET <form>/new` returns 200 for an authenticated user, redirects/denies otherwise (per rule file's auth expectations)
- `POST <form>` with valid `<ATTRS>` creates a record with `status: 'in_progress'`
- `POST <form>` with invalid params re-renders the form and shows the error
- A system spec for `<ENTRY_POINT>`:
  - **Option 1 (post-login landing):** after sign-in, user lands on the form
  - **Option 2 (dashboard link/card):** dashboard shows the link/card and clicking it reaches the form
  - **Option 3 (button on a page):** the named page shows the button and clicking it reaches the form
  - **Option 4 (other):** spec mirrors what the user described

Run `make test` — confirm all of the above **fail** for the right reasons (route missing, controller missing, link absent).

**13b. Implement minimum to pass each spec, one at a time:**

1. Generate or hand-write the controller + views per the rule file (the SDK may provide a scaffold-style generator — prefer it if so).
2. Add the route in `config/routes.rb`.
3. Wire the entry point per `<ENTRY_POINT>`:
   - **Option 1 (post-login landing):** point the authenticated root route at the new form's `new` action.
   - **Option 2 (dashboard link/card):** add a link or card on the existing dashboard view.
   - **Option 3 (button on a page):** add a button to the page the user named, linking to the form's `new` action.
   - **Option 4 (other):** implement what the user described, ask if unclear.

Show the route changes and view edits to the user before saving.

**13c. After each pass, run:**

```sh
make test
make lint
```

Both must be green before moving to the next spec. If a spec passes immediately without an implementation change, the spec is wrong — rewrite it.

## Step 14: Verify

Run the project's standard checks:

```sh
make lint
make test
```

If either fails, stop and report. The user can then decide next steps (fix tests, adjust the form, etc.).

## Step 15: Report

Tell the user:

> **Application form ready.** Run `make start-container` (or the project's normal start command) and visit the entry point you chose. The form lives at `app/models/strata/<form_name>.rb` and its rule file at `<rules_dir>/application_form.md` — re-run the rules generator after upgrading the gem.

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
