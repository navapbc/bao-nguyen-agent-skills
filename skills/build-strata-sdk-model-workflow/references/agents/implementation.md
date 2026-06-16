# Implementation agent

You implement the confirmed model. You read the confirmed model spec and its SDK facts, write the committed plan, run the SDK generator, strengthen the model test-first, and get `make lint` + `make test` green. You work inside the Rails app directory (`rails_dir`) given to you. Every change on top of generator output is test-first.

## 1. Write the committed plan

Follow `../writing-plans.md`. Save to `<RAILS_DIR>/docs/plans/<YYYY-MM-DD>-<model-kebab>.md`. The plan header must list:

- `model_name`, `model_kind`, `purpose` (and `app_type` for application forms)
- the attributes table — name, type, why; flag attributes using a Rails primitive instead of a Strata typed widget
- the validations table (derived below)
- for Strata variants: the SDK base class, the exact generator command (flag spelling from the spec's SDK facts), what the generator produces vs. what you add by hand
- application form: validations under `:submit` context, the `submit_application` flow, the `<ClassName>Created`/`<ClassName>Submitted` events
- case: query-based link to its application form via `application_form_id` (no Rails association to the AF, but `has_many :tasks` is real), case `status` enum (`open/closed`), `business_process_current_step`, `facts` jsonb
- business process: BP DSL (steps via `applicant_task`/`system_process`/`staff_task`, transitions, `start_on_application_form_created`), events listened for
- task: STI parent `Strata::Task`, shared `strata_tasks` table, the BP `staff_task` step that references it, `pending → completed` flow, status-change events
- out-of-scope items (controller, views, policies, BP steps, UI) listed but not built

**Derive default validations here** (they are not in the spec) from each attribute's name and type:

| Attribute pattern (name or type) | Suggested validation |
|----------------------------------|----------------------|
| Any contact field (`name`, `email`, `phone`) | `presence: true` |
| `email` (name contains `email`) | `format: { with: URI::MailTo::EMAIL_REGEXP }` |
| `phone` | `format: { with: /\A[\d\s\-\(\)\+]+\z/ }` |
| Any `:money` type | `numericality: { greater_than_or_equal_to: 0 }` |
| Any `:integer` count (`household_size`, `priority`) | `numericality: { greater_than: 0, only_integer: true }` |
| Any date field treated as required | `presence: true` |
| Any `:tax_id` / `:ssn` / `:address` / `:name` (typed) | `presence: true` (Strata types do their own format validation) |
| Any unique business identifier (`external_case_id`, `business_ein`) | `uniqueness: true` |
| Optional notes / `:text` fields | none unless requested |

For application forms, declare validations the form should enforce only at submission time under `validates ... on: :submit` so partial drafts can save.

## 2. Check for collisions

Before generating, look for existing files:

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

If any expected file already exists, stop and report rather than overwrite or blindly re-run a generator.

## 3. Generate

Use the exact `generator_cmd` / `verified_flags` from the spec's SDK facts. Typical shapes:

**Plain Rails model:**
```sh
bin/rails generate model <ModelName> <ATTRS>
bin/rails db:migrate
```

**Strata application form:**
```sh
bin/rails generate strata:application_form <PROGRAM> <ATTRS>
bin/rails db:migrate
```
Internally chains `strata:model` (which writes the migration) — do **not** run a separate `strata:migration`. Base attrs (`user_id:uuid`, `status:integer`, `submitted_at:datetime`) come from the base class and override any same-named user attribute. Does not create a controller or views.

**Strata case:**
```sh
bin/rails generate strata:case <PROGRAM>
bin/rails db:migrate
```
Also generates staff controllers/views, updates `config/routes.rb` with a `/staff` scope, creates a locale file, and **prompts to chain `strata:business_process` and `strata:application_form`** if missing. Flags (hyphenated): `--business-process`, `--application-form`, `--skip-business-process`, `--skip-application-form`, `--sti`.

**Strata business process:**
```sh
bin/rails generate strata:business_process <PROGRAM>
```
Writes `app/business_processes/<program>_business_process.rb` (not under `app/models/`) and edits `config/application.rb` to add a `config.after_initialize` block calling `<Program>BusinessProcess.start_listening_for_events`. **No migration** (not `ActiveRecord`). Flags (hyphenated): `--case`, `--application-form`, `--skip-application-form`, `--force-application-form`. Re-read `config/application.rb` after to confirm the listener registration was added.

**Strata task:**
```sh
bin/rails generate strata:task <ProgramTaskName>
```
Writes `app/models/<name>_task.rb` (not under `app/models/strata/`) and the spec, inheriting from `Strata::Task`. Checks for the shared `strata_tasks` table; prompts to install Strata's migrations + `db:migrate` only the first time. Flags: `--parent`, `--skip-migration-check`. Run `bin/rails db:migrate` if a migration was created.

For all variants: open the generated files and confirm the model extends the expected base class (e.g. `Strata::ApplicationForm`, not `ApplicationRecord`). Fix anything off inside the TDD loop in §4 — do not silently rewrite generator output without a failing spec.

## 4. TDD-strengthen

Per `../test-driven-development.md`. Generator output may exist without a failing spec first, but **every change from here is test-first**. For each behavior the plan requires:

1. Open the spec file (generator-created, or write one for plain models).
2. Add a single failing example for one behavior — an attribute, a validation, a status transition, a method.
3. Run `make test` (or `bundle exec rspec spec/models/<path>`) and **watch it fail for the right reason**.
4. Edit the model with the minimal change to pass.
5. Run `make test` green.
6. Run `make lint` green.
7. Commit with a one-sentence message naming the behavior.
8. Repeat.

Variant-specific reminders:

- **Plain model:** test column presence indirectly via behavior, not by querying schema.
- **Application form:** declare custom Strata-typed columns with `strata_attribute :name, :type`; plain types use `attribute :name, :type`. Verify it starts `status: "in_progress"`. Verify `submit_application` (not `submit`) flips to `"submitted"`, sets `submitted_at`, returns `true`. Verify post-submit edits **return false** from `save`/`update` (they do not raise — base class uses `errors.add(:base, ...)` + `throw :abort`); assert on `errors[:base]`. Verify `<ClassName>Created`/`<ClassName>Submitted` publish via `Strata::EventManager`. Do **not** add `belongs_to :<case>`.
- **Case:** verify `application_form_id` is settable and queryable via `for_application_form`. Verify `status` defaults `"open"` and the `closed` scope works. Do **not** add `has_one :application_form`. Keep the inherited `has_many :tasks, as: :case`.
- **Business process:** verify it inherits from `Strata::BusinessProcess` (not `ActiveRecord` — no migration). Verify the `<Name>BusinessProcess.start_listening_for_events` line is in `config/application.rb`. Assert `steps.keys` matches the planned steps; for each transition, publish the event via `Strata::EventManager.publish` and assert `business_process_current_step` advances. Use `start_listening_for_events`/`stop_listening_for_events` in setup/teardown.
- **Task:** verify it inherits from `Strata::Task` and the STI `type` column is set on create. Verify default `status: "pending"`. Verify `assign(user_id)` sets `assignee_id` and saves. Verify `case_id`/`case_type`/`type` are `attr_readonly`. Verify a status change publishes `<TaskClass>Pending`/`Completed`/`OnHold` via `Strata::EventManager`. Do **not** create a per-task migration.

If a spec is hard to write, the behavior is unclear — stop and refine the plan.

## 5. Verification gate

Before claiming done, run both in the same message and read the full output:

```sh
make lint
make test
```

Both must show fresh, complete output with zero failures. Do not paraphrase prior runs or trust an earlier "looked green".

## 6. Clean up

Delete the temp spec file at `<RAILS_DIR>/tmp/strata-model-spec-<model-kebab>.md`.

## Return

A concise report: files written, the generator command run, the plan path, and the final `make lint` / `make test` status.
