---
name: build-strata-sdk-model
description: Adds a single Rails model to an existing Rails app — plain ActiveRecord, or a Strata SDK variant (application form, case, business process). Use when adding one model and following test-first development.
---

# Build Strata SDK Model

## Overview

Adds **one** model to an existing Rails app. Two variants:

- **Plain** — vanilla `ApplicationRecord` model.
- **Strata** — inherits from a Strata SDK base class: `Strata::ApplicationForm`, `Strata::Case`, or the SDK business-process base.

Discover the SDK *before* asking the user what to build: verify Ruby, confirm the gem is installed, locate its gem path, then read the gem's docs and generator source. Only then ask the user what model they want, so the conversation is SDK-informed.

**Scope:** one model per invocation. Controllers, views, tasks, policies, and Pundit are out of scope and surfaced during planning.

**TDD is mandatory** for every change made on top of generator output: see [`references/test-driven-development.md`](references/test-driven-development.md).

**Plans are mandatory** before code: see [`references/writing-plans.md`](references/writing-plans.md).

**Before reporting completion**, see [`references/verification.md`](references/verification.md).

---

## Step 1: Locate the Rails app and verify Ruby

The project may be a monorepo — the Rails app may live in a subdirectory (e.g. `apps/<app_name>/`, `<app_name>/`), not the current working directory. Find it before doing anything else.

**1a. Check if cwd is already the Rails app:**

```sh
test -f Gemfile && test -f bin/rails && grep -q "rails" Gemfile
```

- All checks pass → cwd is the Rails app. Save `<RAILS_DIR>=$(pwd)` and skip to **1c**.
- Any check fails → continue to **1b**.

**1b. Search for Rails app directories under cwd (depth ≤ 3):**

```sh
find . -maxdepth 3 -type f -name "Gemfile" -not -path "*/node_modules/*" -not -path "*/.git/*" -exec sh -c 'test -f "$(dirname "$1")/bin/rails" && grep -q "rails" "$1" && (cd "$(dirname "$1")" && pwd)' _ {} \;
```

Interpret the output:

- **Zero matches** → no Rails project reachable. Tell the user this skill must run from a Rails app (or its parent monorepo). Stop.
- **Exactly one match** → confirm with the user:
  > Found Rails app at `<path>`. Use this one? (yes / pick another)

  Save the absolute path as `<RAILS_DIR>` on yes.
- **Multiple matches** → list them and ask:
  > Found multiple Rails apps: `<path1>`, `<path2>`, ... Which one is the target? (number or path)

  Save the chosen absolute path as `<RAILS_DIR>`.

**1c. All subsequent commands run from inside `<RAILS_DIR>`.** If the path differs from cwd, `cd <RAILS_DIR>` before any further work.

**1d. Verify Ruby version matches the project.** Follow [`references/ruby-version-check.md`](references/ruby-version-check.md). Do not proceed until `ruby -v` matches the project's required version and `bundle -v` succeeds.

---

## Step 2: Check whether the Strata SDK is installed

Look for the gem in this app's bundle:

```sh
bundle show strata 2>/dev/null
```

Interpret the output:

- **A path is printed, exit 0** → SDK is installed. Save the path as `<SDK_GEM_PATH>` and continue to Step 3.
- **No output, non-zero exit** → SDK is **not** installed. Tell the user:
  > The `strata` gem is not in this Rails app's bundle. Strata variants (application form, case, business process) require it. You can either:
  >
  > 1. Add `gem "strata"` to the Gemfile and run `bundle install`, then re-run me, or
  > 2. Continue with a **plain** Rails model only.
  >
  > Which do you want?

  - If the user picks (1), stop and wait for them to install the gem; restart the skill afterward.
  - If the user picks (2), set `<SDK_PRESENT>=false` and skip directly to Step 4 (intent), where only `plain` is offered as a kind. Skip Step 3 entirely.

When the SDK is present, set `<SDK_PRESENT>=true`.

---

## Step 3: Read the SDK from its gem path (Strata-present only)

Skip if `<SDK_PRESENT>=false`.

This skill does **not** rely on a curated SDK reference. Read the gem directly to learn what's available *before* asking the user which model to build.

**3a. Verify the gem path looks healthy:**

```sh
ls <SDK_GEM_PATH>/lib/generators/strata/
ls <SDK_GEM_PATH>/app/models/strata/ 2>/dev/null
ls <SDK_GEM_PATH>/docs/ 2>/dev/null
```

If `lib/generators/strata/` is empty or missing, the gem may be partially installed — tell the user, then stop.

**3b. Inventory the generators:**

```sh
ls <SDK_GEM_PATH>/lib/generators/strata/
```

Note which generators exist. The ones relevant to this skill are `application_form`, `case`, `business_process`, and `task`. Others (e.g. `staff`, `model`, `migration`, `application_form_views`, `determination`) are out of scope here but worth noting in case the user asks.

For each of `application_form`, `case`, `business_process`, `task` that exists, read in this order:

1. `<SDK_GEM_PATH>/lib/generators/strata/<gen>/USAGE` — argument shape, expected flags.
2. `<SDK_GEM_PATH>/lib/generators/strata/<gen>/<gen>_generator.rb` — the **authoritative** flag spelling and chaining behavior. USAGE files may be stale or wrong: e.g. the BP USAGE shows `--application_form` (underscored), but the generator's `class_option` is `:"application-form"` — the **hyphenated** form is what works. The generator source decides; USAGE only documents.
3. The base class for that variant:
   - application form → `<SDK_GEM_PATH>/app/models/strata/application_form.rb`
   - case → `<SDK_GEM_PATH>/app/models/strata/case.rb`
   - business process → `<SDK_GEM_PATH>/app/models/strata/business_process.rb` — note: the SDK's BP base class lives under `app/models/strata/`, even though the BP generator writes the *host-app* file to `app/business_processes/<name>_business_process.rb`
   - task → `<SDK_GEM_PATH>/app/models/strata/task.rb` (note: also see `<SDK_GEM_PATH>/app/models/strata/staff_task.rb` if present — staff tasks may inherit from a separate base used in BP `staff_task` steps)

**3c. Skim the relevant docs (if present):**

```sh
ls <SDK_GEM_PATH>/docs/
```

Open any doc whose name matches the variants you're considering — e.g. `intake-application-forms.md`, `case-management-business-process.md`, `strata-attributes.md`, `generators.md`, `authorization.md`. If a doc is missing, trust the source code — it is authoritative.

**3d. Capture findings to use in Step 4 and the plan:**

For each Strata variant, note:

- Exact generator command and flag spelling (verified from `*_generator.rb`).
- Whether the generator chains a migration (`strata:application_form` and `strata:case` typically do via `strata:model`; `strata:business_process` does not produce one; `strata:task` uses a **shared** `strata_tasks` table — its generator prompts to create a single shared migration the first time, then no per-task migrations afterward).
- What the generator produces (model only vs. model + controller + views + routes + locales).
- Base-class methods, declared attributes, validations, and lifecycle hooks the model will inherit. For `task`: note STI (`type` column on shared `strata_tasks` table), `belongs_to :case, polymorphic: true`, status enum (`pending/completed/on_hold`), `due_on`, `assignee_id`, `description`, the `assign(user_id)` / `unassign` API, and the `<TaskClass>#{Status}` event published on status change.
- Available Strata attribute types (see `docs/strata-attributes.md` if present). Capture a list of supported types (e.g. `name`, `address`, `tax_id`, `memorable_date`, `money`, `ssn`, `year_quarter`) so Step 4 can suggest typed attrs.

Trust the gem's files over any external memory. If something below this line contradicts what you just read in the gem, the gem wins — re-read and update your understanding.

---

## Step 4: Confirm intent (SDK-informed)

Now ask the user. The questions you ask depend on what you just learned in Step 3.

**Posture:** the user is *not* expected to be an SDK expert. Lead every prompt with a one-line concept explanation, propose sensible defaults derived from Step 3, and let the user accept-or-edit. Iterate — re-ask any earlier sub-step whose answer changes a later one.

**4a. Model name and kind.**

> What model do you want to build, and what kind?
>
> 1. **Plain Rails model** (vanilla `ApplicationRecord`)
> 2. **Strata application form** (extends `Strata::ApplicationForm`) — *only if `<SDK_PRESENT>=true`*
> 3. **Strata case** (extends `Strata::Case`) — *only if `<SDK_PRESENT>=true`*
> 4. **Strata business process** (extends `Strata::BusinessProcess`) — *only if `<SDK_PRESENT>=true`*
> 5. **Strata task** (extends `Strata::Task`) — *only if `<SDK_PRESENT>=true`*
>
> Give me a name in PascalCase (e.g. `Job`, `UnemploymentApplicationForm`, `UnemploymentCase`, `ReviewApplicationTask`).

If `<SDK_PRESENT>=false`, present only option 1.

Save:
- `<MODEL_KIND>` — one of `plain`, `application_form`, `case`, `business_process`, `task`.
- `<MODEL_NAME>` — PascalCase.
- For Strata variants, derive `<PROGRAM>` (the generator's first argument) by stripping the `ApplicationForm`/`Case`/`BusinessProcess`/`Task` suffix from `<MODEL_NAME>` and PascalCasing it (e.g. `UnemploymentApplicationForm` → `Unemployment`; `ReviewApplicationTask` → `ReviewApplication`).

**4b. Application type (application_form only).**

Skip unless `<MODEL_KIND>=application_form`. The SDK ships an attribute catalog tuned for government intake; knowing the program type lets us suggest a starter attribute set rather than asking the user to invent one.

> What kind of government application is this for? (Pick one or describe your own.)
>
> 1. Unemployment benefits
> 2. SNAP / food assistance
> 3. Medicaid / health coverage
> 4. Housing assistance
> 5. Passport
> 6. Business license
> 7. Appeal
> 8. Other (describe)

Save as `<APP_TYPE>`. Use it to seed the attribute proposal in 4c.

**4c. Purpose.**

> In one sentence, what does this model represent?

Save as `<PURPOSE>`.

**4d. Attributes — propose, then iterate.**

If the user already gave you an attribute list, validate it against the SDK catalog from Step 3 and confirm. **Otherwise propose a starter set** sized to the model kind, then iterate.

For each kind, present the proposed table and ask:

> Here's a starter attribute set based on `<MODEL_KIND>` / `<APP_TYPE>` / `<PURPOSE>`. **Confirm this list, or tell me what to add, remove, or rename.** (yes / edit)

**Plain Rails model:** propose 3–6 attributes likely to belong on `<MODEL_NAME>` given `<PURPOSE>`. Use Rails column types (`string`, `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `references`). Examples by purpose:

- `Job` (job listing) → `title:string`, `description:text`, `location:string`, `salary_min:decimal`, `salary_max:decimal`, `posted_at:datetime`
- `Note` (case note) → `body:text`, `author:references`, `pinned:boolean`
- `Document` → `name:string`, `kind:string`, `uploaded_at:datetime`, `uploader:references`

**Strata application form:** propose typed attributes drawn from the catalog you captured in Step 3 (`name`, `address`, `tax_id`, `memorable_date`, `money`, `ssn`, `year_quarter`, etc.). Tailor by `<APP_TYPE>`:

| Always (every AF) | `name:name`, `birth_date:memorable_date`, `residential_address:address`, `email:string`, `phone:string` |
| **Unemployment** | + `last_employer:string`, `last_day_worked:memorable_date`, `reason_for_separation:string`, `weekly_earnings:money` |
| **SNAP** | + `household_size:integer`, `monthly_income:money`, `monthly_expenses:money` |
| **Medicaid** | + `household_size:integer`, `monthly_income:money`, `citizenship_status:string`, `disability:boolean` |
| **Housing** | + `household_size:integer`, `monthly_income:money`, `current_address:address` |
| **Passport** | + `place_of_birth:string`, `prior_passport_number:string`, `parents_names:name` |
| **Business license** | + `business_name:string`, `business_ein:tax_id`, `business_address:address` |
| **Appeal** | + `decision_being_appealed:string`, `decision_date:memorable_date`, `reason:text` |
| **Other** | ask the user to enumerate the data the form collects, then map each to a catalog type or to a primitive |

The SDK already provides `user_id`, `status`, `submitted_at` — **do not** propose those; they come from `Strata::ApplicationForm.base_attributes_for_generator`. Flag any attribute that has no Strata type (e.g. `email`, `phone`) as a primitive — the user can still use it, just without a typed widget.

**Strata case:** propose case-specific bookkeeping attributes. The SDK already provides `application_form_id:uuid`, `status:integer`, `business_process_current_step:string`, `facts:jsonb` — **do not** propose those. Common additions tailored to `<PURPOSE>`:

- All cases → consider `priority:integer`, `assigned_to:references`, `notes:text` if the program tracks them
- Programs with deadlines → `due_date:date`
- Programs with external IDs → `external_case_id:string`

If you can't think of useful additions for `<PURPOSE>`, propose an empty list and explain — the inherited attributes may be enough.

**Strata business process:** has **no attributes** (it's not an `ActiveRecord` model). Skip 4d for this kind. Capture the **steps** and **transitions** in 4e instead.

**Strata task:** the SDK already provides `description:text`, `due_on:date`, `assignee_id:uuid`, `status:integer`, plus the polymorphic `case`. Subclasses rarely add columns — the `strata_tasks` table is shared via STI and migrations are added across **all** task subclasses. Propose program-specific instance methods (e.g. `time_estimate_hours`, `priority_level`) only if the user has a clear need; otherwise propose an empty attribute list.

Save the confirmed list as `<ATTRS>` (space-separated `name:type` pairs).

**4e. Validations and behavior — propose per attribute, then confirm.**

Walk the confirmed `<ATTRS>` list and propose a validation per attribute, derived from the attribute name + type. Show the user a table and ask:

> Here are sensible default validations based on each attribute's name and type. **Confirm or edit.** (yes / edit)

Defaults to apply mechanically:

| Attribute pattern (name or type) | Suggested validation |
|----------------------------------|----------------------|
| Any contact field (`name`, `email`, `phone`) | `presence: true` |
| `email` (any name containing `email`) | `format: { with: URI::MailTo::EMAIL_REGEXP }` |
| `phone` | `format: { with: /\A[\d\s\-\(\)\+]+\z/ }` |
| Any `:money` type | `numericality: { greater_than_or_equal_to: 0 }` |
| Any `:integer` count (`household_size`, `priority`) | `numericality: { greater_than: 0, only_integer: true }` |
| Any date field treated as required | `presence: true` |
| Any `:tax_id` / `:ssn` / `:address` / `:name` (typed) | `presence: true` (Strata types do their own format validation) |
| Any unique business identifier (`external_case_id`, `business_ein`) | `uniqueness: true` |
| Optional notes / `:text` fields | none unless the user requests one |

For Strata application forms, validations declared without a context fire on every save; declare validations the form should only enforce **at submission time** under `validates ... on: :submit` so partial drafts can save (the SDK's `submit_application` runs `valid?(:submit)`).

Save as `<VALIDATIONS>` (a map: `attr_name → [validation_list]`). Re-confirm if 4d changes the attribute list later.

**4f. Lifecycle and behavior (variant-specific).**

Capture the lifecycle facts the plan needs. **Do not** invent lifecycle behavior — refer to the base class you read in Step 3.

For **plain models:** any callbacks (`after_create`, `before_save`), scopes, or methods the user wants. Ask if unsure.

For **application forms** — the SDK base class (`Strata::ApplicationForm`) gives you:
- `status` enum: `in_progress: 0` (default) and `submitted: 1`.
- `submit_application` instance method (not `submit`) — runs `valid?(:submit)`, then `before_submit`/`after_submit` callbacks, sets `status = :submitted` and `submitted_at = Time.current`, saves, publishes `<ClassName>Submitted`. Returns `false` if validation fails.
- Post-submit edits **do not raise** — `before_update` adds `errors[:base] = "Cannot modify a submitted application"` and `throw :abort`, so `save`/`update` returns `false`.
- `after_create` publishes `<ClassName>Created`.

Ask: is there a custom `before_submit` / `after_submit` callback to run (e.g. compute eligibility, send a confirmation email)?

For **cases** — the base class (`Strata::Case`) gives you:
- `status` enum: `open: 0` (default) and `closed: 1` — note this is **different** from the AF's `in_progress/submitted`.
- `business_process_current_step:string`, `facts:jsonb`.
- `has_many :tasks, as: :case, class_name: "Strata::Task"` — a real Rails relationship.
- Class methods: `business_process`, `application_form_class`.
- Scopes: `actionable`, `closed`, `for_application_form(id)`, `for_event(event)`.

Ask: any case-specific helpers (e.g. `applicant_name` that delegates to the application form via query)?

For **business processes** — the base class (`Strata::BusinessProcess`) is **not** `ActiveRecord`. Subclasses use a DSL:

- `applicant_task('step_name')`
- `system_process('step_name', ->(kase) { ... })`
- `staff_task('step_name', TaskClass)`
- `transition('from_step', 'EventName', 'to_step')`
- `start_on_application_form_created('step_name')` (or another `start_*` start trigger)
- `start_listening_for_events` / `stop_listening_for_events` (called automatically; useful in test teardown)

Ask the user to list each step (name + type + handler/task class), each transition (`from`, event, `to`), and the start trigger. **Cannot be inferred from the SDK** — must come from the user. If unclear, ask clarifying questions until each step + transition is concrete.

For **tasks** — the base class (`Strata::Task`) gives you:
- STI on shared `strata_tasks` table (`type` column is the discriminator).
- Status enum: `pending: 0` (default) / `completed: 1` / `on_hold: 2`.
- `belongs_to :case, polymorphic: true` (real relationship; `case_id`, `case_type` are `attr_readonly`).
- `assign(user_id)` / `unassign` instance methods.
- Status changes auto-publish `<TaskClass>Pending` / `<TaskClass>Completed` / `<TaskClass>OnHold` events via `Strata::EventManager`.
- Default scope orders by `due_on`. Scopes: `due_today`, `due_tomorrow`, `due_this_week`, `overdue`, `completed`, `incomplete`, `unassigned`, `with_type`, `with_status`, `without_status`.

Ask: which BP step references this task (the `staff_task` step in the BP)? Any custom `complete!` flow that does work before flipping status?

Save as `<BEHAVIOR>`.

---

## Step 5: Write the plan

Follow [`references/writing-plans.md`](references/writing-plans.md). Save to `<RAILS_DIR>/docs/plans/<YYYY-MM-DD>-<model-name-kebab>.md`.

The plan header must list:

- `<MODEL_NAME>`, `<MODEL_KIND>`, `<PURPOSE>` (and `<APP_TYPE>` for application forms)
- `<ATTRS>` table — name, type, why; flag attributes that use Rails primitives instead of a Strata typed widget
- `<VALIDATIONS>` table — per attribute, with `on: :submit` context noted where applicable for application forms
- For Strata variants: SDK base class, exact generator command (with flag spelling verified in Step 3b), what the generator produces vs. what we add by hand
- For Strata application form: `<APP_TYPE>`, validations under `:submit` context, submit triggers, `submit_application` flow, the `<ClassName>Created`/`<ClassName>Submitted` events it publishes
- For Strata case: query-based link to its application form via `application_form_id:uuid` (no Rails relationship to AF — but `has_many :tasks` is a real relationship), case `status` enum (`open/closed`), `business_process_current_step`, `facts` jsonb usage
- For Strata business process: BP DSL definition (steps via `applicant_task` / `system_process` / `staff_task`, transitions, `start_on_application_form_created`), events listened for, actions taken on each transition
- For Strata task: STI parent (`Strata::Task`), shared `strata_tasks` table, the BP `staff_task` step that references it, `pending → completed` flow, any custom `complete!` work, status-change events published
- Out-of-scope items (controller, views, policies, BP steps, UI) listed but not built

Each task in the plan must follow the bite-sized TDD shape from [`references/writing-plans.md`](references/writing-plans.md): one failing spec → run and watch fail → minimal code → run green → commit.

Tell the user:

> Plan written to `docs/plans/<YYYY-MM-DD>-<model-name-kebab>.md`. Reply **confirm** to begin, or describe changes.

Iterate until the user confirms.

---

## Step 6: Check what already exists

Before generating, look for collisions:

```sh
# Plain
ls app/models/<model_name_snake>.rb spec/models/<model_name_snake>_spec.rb 2>/dev/null

# Strata variants
ls app/models/strata/<program>_application_form.rb \
   app/models/strata/<program>_case.rb \
   app/business_processes/<program>_business_process.rb \
   app/models/<program>_task.rb \
   spec/models/<program>_task_spec.rb \
   2>/dev/null
```

If any expected file already exists, ask the user how to proceed (overwrite vs. extend in place). Do not blindly re-run a generator over existing code.

---

## Step 7: Generate

Use the generator command exactly as verified in Step 3b. The shapes below are the typical forms; trust your Step 3 reading if it differs.

**7a. Plain Rails model:**

```sh
bin/rails generate model <ModelName> <ATTRS>
bin/rails db:migrate
```

`<ATTRS>` is space-separated `name:type` pairs (e.g. `title:string due_at:datetime user:references`).

**7b. Strata application form:**

```sh
bin/rails generate strata:application_form <PROGRAM> <ATTRS>
```

Internally this chains `strata:model` (which itself produces the migration), so **do not** run a separate `strata:migration` — the chain already wrote one. Optional: `--parent CustomApplicationForm` to override the default parent (`Strata::ApplicationForm`). Base attributes (`user_id:uuid`, `status:integer`, `submitted_at:datetime`) come from `Strata::ApplicationForm.base_attributes_for_generator` and override any user-provided attribute with the same name. Then:

```sh
bin/rails db:migrate
```

This generator does **not** create a controller or views. To produce form-flow views, use `strata:application_form_views` separately (out of scope for this skill).

**7c. Strata case:**

```sh
bin/rails generate strata:case <PROGRAM>
```

This generator does much more than the model. It also: chains `strata:model` for the case (with base attrs `application_form_id:uuid`, `status:integer`, `business_process_current_step:string`, `facts:jsonb`), generates a `<Program>StaffController` if missing, generates a `<Program>CasesController` for staff, generates staff views (`index`, `show`, `documents`, `tasks`, `notes`), updates `config/routes.rb` to add a `/staff` scope, creates a locale file, and **prompts to chain `strata:business_process` and `strata:application_form` if they don't exist**.

Useful flags (all hyphenated; verified in `case_generator.rb`): `--business-process CLASS_NAME`, `--application-form CLASS_NAME`, `--skip-business-process`, `--skip-application-form`, `--sti`. Then `bin/rails db:migrate`.

**7d. Strata business process:**

```sh
bin/rails generate strata:business_process <PROGRAM>
```

This writes `app/business_processes/<program>_business_process.rb` (note: **not** under `app/models/` — that path is reserved for the SDK's own base class) and edits `config/application.rb` to add a `config.after_initialize` block calling `<Program>BusinessProcess.start_listening_for_events`. The generator is idempotent: it bails on the config edit if the `start_listening_for_events` call is already present. **No migration is generated** — `BusinessProcess` is not an `ActiveRecord` model.

The BP also auto-chains `strata:application_form` if the AF class doesn't exist (unless `--skip-application-form` or `--force-application-form` is used). Useful flags (all hyphenated per `business_process_generator.rb`, even though the USAGE file shows underscored forms — trust the generator source): `--case CLASS_NAME`, `--application-form CLASS_NAME`, `--skip-application-form`, `--force-application-form`.

Re-read `config/application.rb` after running to confirm the listener registration was added.

**7e. Strata task:**

```sh
bin/rails generate strata:task <ProgramTaskName>
```

The generator writes `app/models/<name>_task.rb` (note: **not** under `app/models/strata/`) and `spec/models/<name>_task_spec.rb`, both inheriting from `Strata::Task` (or the class given via `--parent`). It checks for the **shared** `strata_tasks` table; if missing, it prompts to install Strata's migrations and run `bin/rails db:migrate`. Subsequent task generations on the same project skip the migration step — the `strata_tasks` table is shared via STI across all task subclasses.

Useful flags (per `task_generator.rb`): `--parent CustomTaskBase`, `--skip-migration-check`. Run `bin/rails db:migrate` after if the generator created a migration.

For all variants: open the generated files and confirm the model extends the base class you expected from Step 3 (e.g. `Strata::ApplicationForm`, not `ApplicationRecord`). If something is off, fix it inside the TDD loop in Step 8 — do not silently rewrite generator output without a failing spec.

---

## Step 8: TDD-strengthen the model

Per [`references/test-driven-development.md`](references/test-driven-development.md): generator output may exist without a failing spec first, but **every change from here is test-first**.

For each behavior the plan requires:

1. Open the spec file (created by the generator, or write a new one for plain models).
2. Add a single failing example for one behavior — an attribute presence, a validation, a status transition, a method.
3. Run `make test` (or `bundle exec rspec spec/models/<path>`) and **watch it fail for the right reason** — undefined method, validation absent, etc.
4. Edit the model file with the minimal change to make the spec pass.
5. Run `make test` green.
6. Run `make lint` green.
7. Commit with a one-sentence message naming the behavior added.
8. Repeat for the next behavior.

Variant-specific reminders:

- **Plain model:** test column presence indirectly via behavior (e.g. validations referencing the column), not by querying schema directly.
- **Application form:** declare custom Strata-typed columns with `strata_attribute :name, :type` (the model includes `Strata::Attributes`); plain types still use `attribute :name, :type`. Verify the form starts with `status: "in_progress"`. Verify `submit_application` (note: **not** `submit`) flips status to `"submitted"`, sets `submitted_at`, and returns `true`. Verify post-submit edits **return false from `save`/`update`** (they do **not** raise — the base class uses `errors.add(:base, ...)` + `throw :abort`); assert on `errors[:base]`. Verify `<ClassName>Created` and `<ClassName>Submitted` events publish via `Strata::EventManager`. Do **not** add `belongs_to :<case>`.
- **Case:** verify `application_form_id` is settable and queryable via the `for_application_form` scope. Verify case `status` defaults to `"open"` and the `closed` scope works. Do **not** add `has_one :application_form` — the link is query-based. **Do** keep the inherited `has_many :tasks, as: :case` — that one is a real Rails relationship.
- **Business process:** verify it inherits from `Strata::BusinessProcess` (it is **not** an `ActiveRecord` model — do not look for a migration). Verify the listener registration line `<Name>BusinessProcess.start_listening_for_events` is present in `config/application.rb`. Test the DSL definition directly: assert `<Name>BusinessProcess.steps.keys` matches the planned steps; for each transition, publish the configured event via `Strata::EventManager.publish` and assert the case's `business_process_current_step` advances. Use `start_listening_for_events` / `stop_listening_for_events` in spec setup/teardown to keep tests isolated.
- **Task:** verify it inherits from `Strata::Task` and that the STI `type` column is set to the class name on create. Verify default `status: "pending"`. Verify `assign(user_id)` sets `assignee_id` and saves. Verify `case_id` / `case_type` / `type` are `attr_readonly` (changes are silently dropped on save). Verify a status change publishes `<TaskClass>Pending` / `<TaskClass>Completed` / `<TaskClass>OnHold` via `Strata::EventManager` (use a test subscriber). Do **not** create a per-task migration — `strata_tasks` is shared.

If a spec is hard to write, that usually means the behavior is unclear. Stop and refine the plan before continuing.

---

## Step 9: Verify

Per [`references/verification.md`](references/verification.md), before claiming done — run both, in this same message, and read the full output:

```sh
make lint
make test
```

Both must show fresh, complete output with zero failures. Do not paraphrase prior runs or trust earlier "looked green".

---

## Step 10: Report

> **Model ready.** `<MODEL_KIND>` model `<MODEL_NAME>`. Files: `app/models/<path>` (and `app/business_processes/<path>` if a business process), spec at `spec/models/<path>`. Plan at `docs/plans/<YYYY-MM-DD>-<model-name-kebab>.md`. `make lint` and `make test` both green. Out-of-scope items (controller, views, policy, tasks, UI) are listed in the plan but not built.

---

## Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `bundle show strata` empty | Gem not in Gemfile, or `bundle install` skipped | Add `gem "strata"`, run `bundle install` |
| BP flag `--application_form` ignored | The BP `USAGE` file shows underscored, but the actual `class_option` in `business_process_generator.rb` is `:"application-form"` (hyphenated) | Use `--application-form` (and `--skip-application-form`, `--force-application-form`); ignore the USAGE file's underscored examples |
| Application form model extends `ApplicationRecord` | Generator output didn't apply the SDK base | Edit to extend `Strata::ApplicationForm` inside the TDD loop |
| `make test` green on first edit | Skipped the RED step | Revert, re-run the spec, watch it fail for the right reason, then re-implement |
| Migration conflict on rerun | Re-ran `strata:application_form` after a partial run | Roll back (`bin/rails db:rollback`), delete the duplicate migration, re-run once |
| Spec asserts `submit_application` raises on post-submit edit | The SDK uses `errors.add(:base, ...)` + `throw :abort`, not an exception | Assert `update`/`save` returns `false` and `errors[:base]` contains `"Cannot modify a submitted application"` |
| Looked for `Strata::BusinessProcess` migration | BP is not `ActiveRecord` — no migration is generated | Remove the migration assertion; test the DSL (`steps`, transitions) and event-listener registration instead |
| Case spec adds `belongs_to :application_form` to make `application_form_id` work | The base class declares `attribute :application_form_id, :uuid`; no association is needed | Use `for_application_form(id)` scope or query `Case.find_by(application_form_id: ...)` |
| Business process events don't fire | Generator skipped `config/application.rb` edit, or the edit was reverted | Re-run `strata:business_process` or restore the listener registration manually |
| Asked the user about Strata variants when SDK isn't installed | Skipped Step 2's SDK detection | Restart from Step 2; only offer `plain` when `<SDK_PRESENT>=false` |
| Asked the user about model details before reading the SDK | Skipped Step 3 | Restart from Step 3; intent questions in Step 4 must be SDK-informed |
| Generators failed because cwd is the monorepo root, not the Rails app | Step 1 was skipped or 1b returned multiple matches and the wrong one was picked | Re-run Step 1; `cd <RAILS_DIR>` before any further command |
| Asked the user "what attributes do you want?" with no proposal | Skipped 4d's starter-set proposal | Restart 4d; propose 3–6 attributes based on `<MODEL_KIND>` / `<APP_TYPE>` / `<PURPOSE>`, then iterate |
| Skipped the validation confirmation step | Skipped 4e | Walk `<ATTRS>` and propose validations per the 4e table; require explicit confirm before Step 5 |
| Tried to generate a per-task migration | Misread the SDK — `strata_tasks` is a shared STI table | Skip the migration step on subsequent `strata:task` runs; `--skip-migration-check` if the table already exists |
| Edited `case_id` / `case_type` / `type` on a Task in a spec and the change "didn't stick" | These columns are `attr_readonly` on `Strata::Task` | Set them at create time; expect post-create writes to be silently dropped |

---

## Reference

- Ruby version: [`references/ruby-version-check.md`](references/ruby-version-check.md)
- TDD: [`references/test-driven-development.md`](references/test-driven-development.md)
- Plans: [`references/writing-plans.md`](references/writing-plans.md)
- Verification: [`references/verification.md`](references/verification.md)
- Strata SDK source: read directly from `<SDK_GEM_PATH>` (output of `bundle show strata`) — no curated reference is used by this skill.
- Strata SDK upstream: https://github.com/navapbc/strata-sdk-rails
