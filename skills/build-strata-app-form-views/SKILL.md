---
name: build-strata-app-form-views
description: Builds views, flow, and routes for a Strata multi-page application form on top of an existing ApplicationForm model. Use after generating the model with build-strata-sdk-model — covers pages, step indicator, review, and dashboard.
---

# Build Strata App Form Views

## Overview

Builds the **view layer** for a Strata multi-page application form: the member-portal layout and shared header partial, the `Strata::Flows::ApplicationFormFlow`-based flow class that declares each `task` / `question_page`, one ERB template per page, a review page, a post-submit confirmation page, and an optional "My applications" dashboard.

**Hard prerequisite:** an `ApplicationForm` subclass already exists in this Rails app (a class extending `Strata::ApplicationForm`). If it does not, **stop** and run [`build-strata-sdk-model`](../build-strata-sdk-model/SKILL.md) first — this skill builds views on top of an existing model and will not invent attributes.

Read these two references **before** writing any view code — together they are the design contract:

- Design patterns (one-question-per-page, save-and-exit, review-before-submit, error messaging, etc.): [`references/design-patterns.md`](references/design-patterns.md)
- UI kit components (form-builder helpers, `Strata::US::TableComponent`, partials, USWDS tokens): [`references/ui-kit-components.md`](references/ui-kit-components.md)

When the curated references don't fully detail something the user asked for, **read the SDK gem directly** in Step 6 — the gem is authoritative.

**TDD is mandatory**: every page template is preceded by a failing request spec, and the flow ends with one full-flow system spec. See [`references/test-driven-development.md`](references/test-driven-development.md).

**Plans are mandatory before code**: see [`references/writing-plans.md`](references/writing-plans.md).

**Before reporting completion**: see [`references/verification.md`](references/verification.md).

---

## Step 1: Locate the Rails app and verify Ruby

Same procedure as `build-strata-sdk-model` Step 1 — find the Rails root, save it as `<RAILS_DIR>`, and verify Ruby.

**1a. Check if cwd is the Rails app:**

```sh
test -f Gemfile && test -f bin/rails && grep -q "rails" Gemfile
```

All pass → `<RAILS_DIR>=$(pwd)`, skip to **1c**. Any check fails → continue to **1b**.

**1b. Search under cwd (depth ≤ 3):**

```sh
find . -maxdepth 3 -type f -name "Gemfile" -not -path "*/node_modules/*" -not -path "*/.git/*" -exec sh -c 'test -f "$(dirname "$1")/bin/rails" && grep -q "rails" "$1" && (cd "$(dirname "$1")" && pwd)' _ {} \;
```

Zero matches → stop, tell the user this skill must run from a Rails app or its monorepo parent. One match → confirm with user. Multiple → ask which.

**1c.** `cd <RAILS_DIR>` before any further command.

**1d. Verify Ruby.** Follow [`references/ruby-version-check.md`](references/ruby-version-check.md). Do not proceed until `ruby -v` matches the project requirement and `bundle -v` succeeds.

---

## Step 2: Verify the Strata SDK is installed

Views require the SDK — there is no plain-Rails fallback (unlike `build-strata-sdk-model`).

```sh
bundle show strata 2>/dev/null
```

- A path is printed, exit 0 → save it as `<SDK_GEM_PATH>` and continue.
- No output / non-zero → tell the user:
  > The `strata` gem is not in this Rails app's bundle. This skill needs `Strata::FormBuilder`, `Strata::Flows::ApplicationFormFlow`, and the `strata/shared/*` partials. Add `gem "strata"` to the Gemfile, run `bundle install`, and re-run me. Stopping.

  Then stop. Do not offer a plain-Rails fallback.

---

## Step 3: Find the ApplicationForm model

This skill builds views **on top of** an existing `Strata::ApplicationForm` subclass. Find it first; refuse to continue without one.

**3a. Grep for ApplicationForm subclasses:**

```sh
grep -rln "< Strata::ApplicationForm" app/models/ 2>/dev/null
```

Interpret:
- **Zero matches** → tell the user:
  > No `Strata::ApplicationForm` subclass found in `app/models/`. This skill builds views on top of an existing application-form model. Run the **`build-strata-sdk-model`** skill first to generate one, then re-run me.

  Stop. Do not offer to stub a model — that's the sibling skill's job.
- **Exactly one match** → save the class name as `<MODEL_NAME>` (PascalCase) and the file path as `<MODEL_PATH>`. Confirm with the user:
  > Found application-form model `<MODEL_NAME>` at `<MODEL_PATH>`. Build views for this one? (yes / pick another)
- **Multiple matches** → list them and ask which to target. Save the chosen pair as `<MODEL_NAME>` / `<MODEL_PATH>`.

**3b. Derive `<PROGRAM>` and `<MODEL_KEBAB>`:**

`<PROGRAM>` = `<MODEL_NAME>` with the `ApplicationForm` suffix stripped, snake_cased (e.g. `BenefitsApplicationForm` → `benefits`). `<MODEL_KEBAB>` = `<PROGRAM>` kebab-cased for filenames.

**3c. Read the model file:**

```sh
cat <MODEL_PATH>
```

Capture for use in Step 4:
- Every `strata_attribute :name, :type` and `attribute :name, :type` declaration
- Every `validates ..., on: :<context>` — the `on:` symbols are the natural page boundaries (one `question_page` per context)
- Any `has_many` / `belongs_to` (nested resources may need their own pages)
- Any custom `before_submit` / `after_submit` callback (informs the confirmation page copy)

---

## Step 4: Read the references and infer page structure

Read both heavyweight references in full before proposing pages:

1. [`references/design-patterns.md`](references/design-patterns.md) — one-page-per-question, save-and-exit, review-before-submit, error messaging, mobile/a11y patterns.
2. [`references/ui-kit-components.md`](references/ui-kit-components.md) — `strata_form_with`, every form-builder helper (`text_field`, `memorable_date`, `address_fields`, `name`, `yes_no`, `radio_button`, `select`, `conditional`, etc.), `strata/shared/step_indicator`, `strata/shared/form_buttons`, `strata/shared/exit_link`, `Strata::US::TableComponent`.

Then infer the page structure from Step 3c:

**Page-boundary rule:** one `question_page` per distinct `on: :<context>` symbol found on the model's validations, **in declaration order**. The context name becomes the page name. Attributes without an `on:` context belong to the first page that mentions them, or to a catch-all `other` page at the end.

**Field-grouping rule:** within a page, group related attributes by their *typed* widget:
- `:name`-typed columns → render with `f.name` (one helper for all four sub-fields)
- `:address`-typed columns → `f.address_fields`
- `:memorable_date`-typed columns → `f.memorable_date`
- `:money`-typed columns → `f.money_field`
- `:tax_id` / `:ssn` → `f.tax_id_field`
- boolean attribute with a `_question` or `is_` prefix → `f.yes_no`
- string attribute backed by an enum or a known choice list → `f.radio_button` (≤ 5 options) or `f.select` (≥ 6 options)
- everything else → `f.text_field` / `f.email_field` / `f.phone_field` / `f.text_area`

Capture the proposal as a table you'll show the user in Step 5:

| Page (`question_page`) | Attributes | Widget(s) |
|---|---|---|
| `:name` | `first_name`, `middle_name`, `last_name`, `suffix` | `f.name :applicant_name` |
| `:date_of_birth` | `date_of_birth` | `f.memorable_date` |
| `:contact` | `email`, `phone` | `f.email_field`, `f.text_field` (`inputmode: "tel"`) |
| `:address` | `mailing_address_*` | `f.address_fields :mailing_address` |
| … | … | … |

Save this table as `<PAGE_PROPOSAL>`.

---

## Step 5: Confirm intent

Walk the user through the structure before writing anything. Lead each prompt with a one-line concept and propose the default from Step 4; let the user accept-or-edit.

**5a. Confirm the page list and field grouping.**

Show `<PAGE_PROPOSAL>` from Step 4 and ask:

> Here's the proposed page structure (one `question_page` per validation context, grouped by typed widget). **Confirm or edit.** (yes / edit)

Iterate. Save the confirmed result as `<PAGES>` (ordered list of `{page_name, fields, widgets}` records).

**5b. Confirm the Flow class.**

> The flow class will be `<MODEL_NAME>Flow` (e.g. `BenefitsApplicationFormFlow`) at `app/flows/<model_kebab>_flow.rb`. Including `Strata::Flows::ApplicationFormFlow`. Use this name? (yes / different name)

Save as `<FLOW_CLASS>` and `<FLOW_PATH>`.

**5c. Confirm the task grouping.**

`question_page`s in the Strata DSL live inside `task` blocks. Each task can declare `depends_on:` to enforce ordering. Propose one task per logical section (e.g. `:personal_information`, `:contact`, `:household`, `:employment`) and ask:

> Here's the proposed task grouping. Each task contains one or more question_pages, and later tasks depend_on earlier ones. **Confirm or edit.** (yes / edit)

Save as `<TASKS>` (ordered list of `{task_name, page_names, depends_on}` records).

**5d. Layout strategy.**

The SDK ships only a **staff** layout (`<SDK_GEM_PATH>/app/views/layouts/strata/staff.html.erb`). A member-portal layout is **not** provided — see [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Layout / Application Header" for the recommended pattern.

> No member-portal layout exists. Options:
> 1. Create `app/views/layouts/application.html.erb` + `app/views/shared/_header.html.erb` from the reference's recommended pattern (default).
> 2. Skip — I'll reuse an existing layout you point me at.
>
> Which?

Save as `<LAYOUT_STRATEGY>`.

**5e. Review page.**

> A review page (`end_page :review` in the flow DSL) renders a section per task with an "Edit" link back into each page. Include it? (yes / no — default yes)

Save as `<INCLUDE_REVIEW>` (default `true`).

**5f. Confirmation page.**

> After submit, a confirmation page shows a success alert, reference number, and "what happens next" copy. Include it? (yes / no — default yes)

Save as `<INCLUDE_CONFIRMATION>` (default `true`). If yes, ask for the "what happens next" copy (timeline, contact info) and save as `<CONFIRMATION_COPY>`.

**5g. Application forms index page.**

The canonical member entry point is the application form resource's own `:index` route (`/<model_kebab>s`) — this is where a member lands to see their applications and start a new one. The index template must render:

1. A **"Start a new application"** primary button linking to `new_<model_kebab>_path`.
2. An **In-progress applications** section — every record where `submitted_at` is `nil`, rendered with `Strata::US::TableComponent` (columns: started date, last updated, "Continue" link → `<model_kebab>_path(form)`).
3. A **Completed applications** section — every record where `submitted_at` is present (columns: submitted date, reference number, "View" link → `<model_kebab>_path(form)`).

> Include the application forms index page at `app/views/<model_kebab>s/index.html.erb`? (yes / no — default yes; **strongly recommended** because the `:index` action is already in the routes block from Step 9b and a route without a template is dead weight)

Save as `<INCLUDE_INDEX_PAGE>` (default `true`). If the user declines, **remove `:index` from the resources block in Step 9b** so you don't ship an unreachable route.

**5h. Show / landing page.**

> The application form's show page is a task-list landing — it renders `Strata::Flows::TaskListComponent`, which lists each task with its state-appropriate action (Start / Continue / Edit / "Cannot start yet") and a built-in "Review and Submit" button (auto-disabled until every task is complete). Use this default? (yes / no — default yes)

Save as `<INCLUDE_SHOW_PAGE>` (default `true`). If yes, capture the host-app i18n keys you'll need: one `{title, description}` pair per task under `<model_plural>.task_section_component.<task_name>.*`, plus `<model_kebab>.show.in_progress_title` and `in_progress_description` for the page header. See [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Form Show Page".

---

## Step 6: Consult the SDK gem for any remaining gaps

The curated references (`design-patterns.md`, `ui-kit-components.md`) cover the common path but cannot stay perfectly in sync with the gem. After Step 5, look at the confirmed scope and identify anything the curated refs do not fully detail — then read the gem directly at `<SDK_GEM_PATH>`. **The gem is authoritative**: if it contradicts a reference, trust the gem and update your understanding before writing the plan.

**6a. Inventory the gem's view-layer surface area:**

```sh
ls <SDK_GEM_PATH>/lib/generators/strata/
ls <SDK_GEM_PATH>/app/views/strata/shared/
ls <SDK_GEM_PATH>/app/views/layouts/strata/ 2>/dev/null
ls <SDK_GEM_PATH>/app/helpers/strata/
ls <SDK_GEM_PATH>/app/components/strata/ 2>/dev/null
ls <SDK_GEM_PATH>/lib/strata/flows/ 2>/dev/null
ls <SDK_GEM_PATH>/docs/
ls <SDK_GEM_PATH>/spec/dummy/app/ 2>/dev/null
```

**6b. Targeted reads by scope item.** For each piece of confirmed scope from Step 5, open the matching gem path and skim until you can describe the API in one paragraph:

| Scope item | Read in the gem |
|---|---|
| Flow DSL (`task` / `question_page` / `depends_on` / `end_page` / `start_*`) | `<SDK_GEM_PATH>/docs/multi-page-form-flows.md`; `<SDK_GEM_PATH>/lib/strata/flows/application_form_flow.rb` (and siblings under `lib/strata/flows/`) |
| `application_form_views` generator (Step 9 will run this) | `<SDK_GEM_PATH>/lib/generators/strata/application_form_views/USAGE` **and** `*_generator.rb` — USAGE files may be stale; the generator source is authoritative for flag spelling |
| Form-builder helpers not covered by `ui-kit-components.md` | `<SDK_GEM_PATH>/app/helpers/strata/form_builder.rb`; `<SDK_GEM_PATH>/docs/strata-form-builder.md` |
| Partial locals (step_indicator, form_buttons, exit_link) | `<SDK_GEM_PATH>/app/views/strata/shared/_step_indicator.html.erb`, `_form_buttons.html.erb`, `_exit_link.html.erb` |
| Routes / named-route helpers the flow exposes | grep `<SDK_GEM_PATH>` for `flow_step_path`, read the engine's `config/routes.rb`, and any flow-routing module under `lib/strata/flows/` |
| Draft-state semantics on the model | `<SDK_GEM_PATH>/app/models/strata/application_form.rb` |
| `Strata::US::TableComponent` options (if `<INCLUDE_INDEX_PAGE>`) | `<SDK_GEM_PATH>/app/components/strata/us/table_component.rb` |
| `Strata::ConditionalFieldComponent` (if any page uses `f.conditional`) | `<SDK_GEM_PATH>/app/components/strata/conditional_field_component.rb` |
| Member layout shape (if `<LAYOUT_STRATEGY>` = create) | `<SDK_GEM_PATH>/app/views/layouts/strata/staff.html.erb` (staff is the only one shipped — use as inspiration, not a copy) |
| Canonical end-to-end examples | `<SDK_GEM_PATH>/spec/dummy/app/` (flows, views, controllers, locales) |
| Member layout shape (if `<LAYOUT_STRATEGY>` = create) | `<SDK_GEM_PATH>/app/views/layouts/strata/staff.html.erb` (staff is the only one shipped — use as inspiration, not a copy) |

**6c. Capture gaps as `<SDK_GAPS>`:**

For each gap closed by reading the gem, record one row:

| Gap | What the curated ref said (or omitted) | What the gem actually does | Affected plan task |
|---|---|---|---|

This table goes into the plan header in Step 7 so the engineer executing the plan inherits the same context.

If the gem reveals a behavior that contradicts a curated reference, **do not silently rewrite the reference** — note the discrepancy in `<SDK_GAPS>` and flag it for the user. The references are part of this skill and need a deliberate update if the gem has moved on.

---

## Step 7: Write the plan

Follow [`references/writing-plans.md`](references/writing-plans.md). Save to `<RAILS_DIR>/docs/plans/<YYYY-MM-DD>-<MODEL_KEBAB>-views.md`.

The plan header must list:
- `<MODEL_NAME>` (existing model), `<MODEL_PATH>`, `<FLOW_CLASS>`, `<FLOW_PATH>`
- The full `<PAGES>` × `<TASKS>` matrix — one table row per `question_page` with its `task`, `depends_on`, fields, widgets, and the route `flow_step_path(:<page>)`
- `<LAYOUT_STRATEGY>`, `<INCLUDE_INDEX_PAGE>`, `<INCLUDE_SHOW_PAGE>`, `<INCLUDE_REVIEW>`, `<INCLUDE_CONFIRMATION>`, `<CONFIRMATION_COPY>`
- A **routes-to-templates matrix** — every route the plan adds to `routes.rb`, the controller action that handles it, the template file it renders, and the request spec that proves it works. There must be **no orphan rows** (route with no template) and **no orphan specs** (spec with no route). Use the table from Step 9b as the template.
- `<SDK_GAPS>` table from Step 6 — every gap closed by reading the gem, with file references
- Every locale key needed:
  - `strata.application_forms.steps.<page>` per `question_page` (step indicator)
  - `<model_plural>.task_section_component.<task_name>.title` and `.description` per task in `<TASKS>` (TaskListComponent rows — these are host-defined; missing keys render as visible `translation missing: …` text)
  - `<model_kebab>.show.in_progress_title` and `<model_kebab>.show.in_progress_description` (if `<INCLUDE_SHOW_PAGE>`)
  - `<model_kebab>s.index.start_new`, `<model_kebab>s.index.in_progress_heading`, `<model_kebab>s.index.completed_heading` (if `<INCLUDE_INDEX_PAGE>`)
  - Any custom keys for review-section headings

Each task in the plan must follow the TDD shape from `writing-plans.md`: failing spec → run red → minimal code → run green → commit. Pages are bite-sized — one page per task.

**Pause for user review.** This is a hard stop — do not write any code (no templates, no specs, no controllers, no routes) until the user has read the plan and replied with explicit confirmation. Tell the user:

> Plan written to `docs/plans/<YYYY-MM-DD>-<MODEL_KEBAB>-views.md`.
>
> **Please open and read the full plan before I continue.** Pay attention to the page × task matrix, the locale keys, and the `<SDK_GAPS>` table — those are the bits most likely to surprise you.
>
> When you're ready, reply **"confirm"** (literal word) to begin Step 8. Reply with anything else — corrections, questions, "looks good but change X" — and I will revise the plan and re-ask. I will not start building until I see your explicit "confirm".

If the user replies with anything other than "confirm" (including "yes", "ok", "looks good", "go ahead"), treat it as feedback or a request for changes and iterate — do not advance to Step 8. Only the literal word "confirm" (case-insensitive) unblocks the build.

Iterate until confirmed.

---

## Step 8: Check what already exists

Before generating, look for collisions:

```sh
ls app/views/layouts/application.html.erb \
   app/views/shared/_header.html.erb \
   <FLOW_PATH> \
   app/controllers/<MODEL_KEBAB>s_controller.rb \
   app/views/<MODEL_KEBAB>s/ \
   app/views/<MODEL_KEBAB>s/index.html.erb \
   app/views/<MODEL_KEBAB>s/show.html.erb \
   config/locales/en.yml \
   2>/dev/null
grep -n "strata\|<MODEL_KEBAB>" config/routes.rb 2>/dev/null
```

If any expected file already exists, ask the user how to proceed (overwrite vs. extend in place). Do not blindly re-run generators over existing code.

---

## Step 9: Generate scaffolding

**9a. Check for the SDK's `application_form_views` generator:**

```sh
ls <SDK_GEM_PATH>/lib/generators/strata/application_form_views/ 2>/dev/null && \
  cat <SDK_GEM_PATH>/lib/generators/strata/application_form_views/USAGE 2>/dev/null
```

If the generator exists, use the flag spelling you verified in Step 6b (USAGE may be stale; the `*_generator.rb` is authoritative). Typical invocation:

```sh
bin/rails generate strata:application_form_views <PROGRAM>
```

This typically produces: a controller, a `views/` directory with placeholder ERB per page, a route entry, and an English locale stub. After running, **diff every generated file against `<PAGES>`** — the generator's placeholders likely don't match your confirmed widgets. Continue to Step 10 for the TDD-driven edit pass.

**9b. If the generator is absent**, hand-roll the scaffolding:

- Create `<FLOW_PATH>` with the `<FLOW_CLASS>` definition (one `task` block per `<TASKS>` entry, one `question_page` per `<PAGES>` entry, `end_page :review` if `<INCLUDE_REVIEW>`).
- Add the routes at the **top level** of `Rails.application.routes.draw do ... end`. **Do NOT wrap them in a `scope "(:locale)"` block** — the gem's `flow_step_path`, the auto-generated `*_edit` / `*_update` helpers, and the built-in "Review and Submit" link inside `TaskListComponent` all resolve unscoped URL helpers. Nesting them under a locale scope makes every callsite require an explicit `locale:` arg and breaks the auto-generated button. Canonical pattern (mirrors `<SDK_GEM_PATH>/spec/dummy/config/routes.rb`):
  ```ruby
  resources :<model_kebab>s, only: [:index, :new, :show, :create] do
    member do
      <FLOW_CLASS>.pages.each do |page|
        get page.edit_pathname
        patch page.update_pathname
      end
      get :review
      patch :submit
    end
  end
  ```
- Create one ERB template **per `question_page`** under `app/views/<MODEL_KEBAB>s/` opening with `strata_form_with(model: @application_form, url: ..., method: :patch)` and the `strata/shared/step_indicator`, `strata/shared/form_buttons`, `strata/shared/exit_link` partials per [`references/ui-kit-components.md`](references/ui-kit-components.md). Pass `exit_path: <model_kebab>s_path` to the exit-link partial so Save & Exit lands the member back on the index page.
- **Every route in the resources block must lead to a template.** If a route is declared in `routes.rb` it must have (a) a controller action, (b) a view template, and (c) a request spec in Step 10. Routes without templates are dead weight and will 500 on first click. The matrix:
  | Route | Template | Notes |
  |---|---|---|
  | `index` (if `<INCLUDE_INDEX_PAGE>`) | `app/views/<MODEL_KEBAB>s/index.html.erb` | Member "My applications" — see next bullet |
  | `new` | n/a (controller redirects to first flow step via `create` → `flow_step_path`) | Or render a one-page intro/eligibility template if the user asked for one |
  | `show` (if `<INCLUDE_SHOW_PAGE>`) | `app/views/<MODEL_KEBAB>s/show.html.erb` | Task-list landing — see next bullet |
  | Each `question_page` | `app/views/<MODEL_KEBAB>s/<page>.html.erb` | Form page — see first bullet |
  | `review` (if `<INCLUDE_REVIEW>`) | `app/views/<MODEL_KEBAB>s/review.html.erb` | Section-per-task summary with Edit links |
  | `submit` | n/a (controller transitions state and redirects to confirmation) | |
  | Confirmation (if `<INCLUDE_CONFIRMATION>`) | `app/views/<MODEL_KEBAB>s/confirmation.html.erb` | Success alert + reference number |
- If `<INCLUDE_INDEX_PAGE>`, create `app/views/<MODEL_KEBAB>s/index.html.erb` per [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Forms Index". The controller's `index` action must expose two collections — `@in_progress_application_forms` (records where `submitted_at` is nil, scoped to `current_user`) and `@completed_application_forms` (records where `submitted_at` is present, scoped to `current_user`). The template renders a "Start a new application" primary button linking to `new_<model_kebab>_path`, then a `Strata::US::TableComponent` for each collection (omit the section if its collection is empty, but always render the "Start new" button).
- If `<INCLUDE_SHOW_PAGE>`, create `app/views/<MODEL_KEBAB>s/show.html.erb` rendering `Strata::Flows::TaskListComponent.new(flow: @flow, show_step_label: true)` per [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Form Show Page". **Do NOT add a separate "Review and Submit" button — the component ships one and disables it until `@flow.completed?`.**
- Seed `config/locales/en.yml` with:
  - `strata.application_forms.steps.<page>` per question page (step indicator)
  - `<model_plural>.task_section_component.<task_name>.{title,description}` per task (TaskListComponent rows — host-defined)
  - `<model_kebab>.show.in_progress_title` and `<model_kebab>.show.in_progress_description` (show page heading)

**9c. Member layout (only if `<LAYOUT_STRATEGY>` = create):**

Create `app/views/layouts/application.html.erb` and `app/views/shared/_header.html.erb` from the templates in [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Layout" and "Application Header".

**9d. Controller (always required):**

Create or extend `app/controllers/<MODEL_KEBAB>s_controller.rb`. The `index` action must expose `@in_progress_application_forms` and `@completed_application_forms`, both scoped to `current_user` — see the controller contract in [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Forms Index". `show` sets `@flow = <FLOW_CLASS>.new(@application_form)`. `create` builds a draft via `current_user.<model_kebab>s.create!` and redirects to the flow's first step. Per-page `edit`/`update` actions, `review`, and `submit` round out the controller.

**Do NOT create a separate `DashboardController`** — earlier versions of this skill did, and it produced two competing landing pages. The application form resource's own `index` action IS the member-facing dashboard.

---

## Step 10: TDD-build / strengthen the views

Per [`references/test-driven-development.md`](references/test-driven-development.md): every page is built test-first.

For each entry in `<PAGES>`, in order:

1. Write a failing **request spec** at `spec/requests/<MODEL_KEBAB>s/<page_name>_spec.rb`:
   - `GET` the page's `flow_step_path(:<page>)` and assert response 200 and that each expected label / hint / widget rendered (use `assert_select` or `have_selector` matchers against the USWDS classes from [`references/ui-kit-components.md`](references/ui-kit-components.md)).
   - `PATCH` the page with invalid params and assert the page re-renders with the SDK's `usa-error-message` markup.
   - `PATCH` the page with valid params and assert redirect to the next step.
2. Run `make test spec/requests/<MODEL_KEBAB>s/<page_name>_spec.rb` — watch it fail for the right reason (missing template, missing route, missing locale key).
3. Edit (or create) the page's ERB template with the minimum to pass — use the form-builder helpers from [`references/ui-kit-components.md`](references/ui-kit-components.md).
4. Run the same spec — watch it pass.
5. Run `make lint`.
6. Commit with a one-sentence message naming the page added.
7. Repeat for the next page.

If `<INCLUDE_INDEX_PAGE>`, write a failing **index-page request spec** at `spec/requests/<MODEL_KEBAB>s/index_spec.rb` with two `context` blocks:

1. **Empty state** — no application forms exist for `current_user`. `GET <model_kebab>s_path` returns 200, the body contains a link to `new_<model_kebab>_path` with text `I18n.t("<model_kebab>s.index.start_new")`, and `response.body` contains no `<table>` element.
2. **Populated state** — create three fixtures: an in-progress form for `current_user` (`submitted_at: nil`), a completed form for `current_user` (`submitted_at: 1.day.ago`), and a third form belonging to a **different user**. Assert: the Start-new link still renders; both `in_progress_heading` and `completed_heading` i18n values appear in the body; the in-progress row links to `<model_kebab>_path(in_progress)` with text `Continue`; the completed row links to `<model_kebab>_path(completed)` with text `View`; **and the third user's form path does NOT appear in the body** (this catches scope leaks).

Run, watch fail (likely "missing template" or "translation missing"), implement against [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Forms Index", run green, commit.

If `<INCLUDE_SHOW_PAGE>`, after all `question_page` specs pass, write a failing **show-page request spec** at `spec/requests/<MODEL_KEBAB>s/show_spec.rb`:

- `GET` the application form's show path. Assert response 200 and that `Strata::Flows::TaskListComponent`'s root element renders (USWDS class `usa-collection`).
- For **each task in `<TASKS>`**, assert the response body contains the value of `I18n.t("<model_plural>.task_section_component.<task_name>.title")` and `I18n.t("<model_plural>.task_section_component.<task_name>.description")`. Use `I18n.t(...)` (not hardcoded strings) so the assertion fails loudly if the host-app key is missing OR the template stops reading from i18n.
- Assert the "Review and Submit" button is present on a fresh record and **disabled** (look for `disabled="disabled"` or the USWDS `usa-button[disabled]` selector).
- Build a factory-stage helper that marks every task complete (e.g. fills every required attribute), then re-`GET` the show page and assert the same button is now **enabled**.
- Run `make test spec/requests/<MODEL_KEBAB>s/show_spec.rb` — watch it fail (likely "translation missing" or missing template), fix by adding the keys and rendering the component, run green, commit.

After all pages pass, write **one** system spec at `spec/system/<MODEL_KEBAB>_flow_spec.rb` that walks the entire flow end-to-end: visits the first step, fills + submits each page in order, lands on the review page, clicks an Edit link, comes back, submits, and lands on the confirmation page with the success alert. Run, watch fail, fix, run green, commit.

Reminders pulled from [`references/design-patterns.md`](references/design-patterns.md):
- **One thing per page** — never bundle unrelated fields into one `question_page`.
- **Show progress** — render `strata/shared/step_indicator` on every page; locale keys at `strata.application_forms.steps.*`.
- **Save and Exit** — render `strata/shared/exit_link` on every form page; the SDK persists draft state automatically.
- **Mark required, not optional** — pass `required: true` (HTML attr + asterisk) but use `optional: true` only on truly optional fields.
- **Error messages** — never write the markup by hand; let the form builder render `usa-error-message` from model validations. Wire messages via `activemodel.errors.models.<model>.attributes.<field>.<rule>` i18n keys.
- **Inline errors only** for multi-page forms — no summary-at-top banner.
- **Plain language** — 8th-grade reading level, short sentences, active voice, "you/your".

---

## Step 11: Verify

Per [`references/verification.md`](references/verification.md), before claiming done — run both, in this same message, and read the full output:

```sh
make lint
make test
```

Both must show fresh, complete output with zero failures.

Then run a **visual walk-through** in Claude in Chrome:
1. Boot `bin/dev` (or `bin/rails server`) in the background.
2. **Start at the member index route** (`/<model_kebab>s`) in a new tab. Confirm: the "Start a new application" button is visible; if you have seed data, in-progress and completed sections render correctly.
3. Click "Start a new application" → land on the first flow step. Walk every page — confirm the step indicator updates, labels match the locale entries, validation errors render inline with `usa-error-message`, Back/Continue work, Save and Exit returns you to the index page and the form now appears in the In-progress section.
4. Continue the in-progress form back to the review page, click an Edit link, come back, submit, and confirm the confirmation page renders the success alert with the reference number. Return to the index — the form should now appear in the Completed section.
5. Capture any rendering bugs as new failing specs and fix inside the TDD loop — do not silently patch templates.

---

## Step 12: Report

End with a status message that **explicitly tells the user the browser URL** they need to visit to start a new application. Derive the path by grepping `routes.rb` for the resource and using the Rails-generated helper (`<model_kebab>s_path`, normally `/<model_kebab>s`; prepend any host-app parent scope). If `<INCLUDE_INDEX_PAGE>` is `false`, report the direct entry path instead (`/<model_kebab>s/new` or the first `flow_step_path`) so the user always has a one-line way to reach the form. Suggested wording:

> **Views ready.** Application form `<MODEL_NAME>` now has flow `<FLOW_CLASS>` with `<N>` pages, member index at `app/views/<MODEL_KEBAB>s/index.html.erb`, show / review / confirmation pages as configured, and the member-portal layout (if `<LAYOUT_STRATEGY>` = create). Plan: `docs/plans/<YYYY-MM-DD>-<MODEL_KEBAB>-views.md`. `make lint` and `make test` both green. Visual walk-through clean.
>
> **To start a new application in your browser, visit `http://localhost:3000/<model_kebab>s`** (boot the app with `bin/dev` if it isn't running; click "Start a new application" from the index page).

---

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `bundle show strata` empty | Gem not in Gemfile, or `bundle install` skipped | Add `gem "strata"`, run `bundle install`, restart |
| Skipped to view-building without finding a model | Skipped Step 3 — no `Strata::ApplicationForm` subclass exists | Stop. Run `build-strata-sdk-model` first |
| Plan promised a flow feature the curated refs only hint at | Skipped Step 6 — went from intent straight to writing the plan | Re-open the gem at `<SDK_GEM_PATH>`, read the relevant file, and update the plan |
| Generator flag `--foo` ignored or "unknown option" | USAGE file showed an outdated spelling | Read `*_generator.rb` in `<SDK_GEM_PATH>/lib/generators/strata/application_form_views/` for the authoritative `class_option` spelling |
| Hand-wrote `usa-error-message` markup in a template | Form builder renders this automatically when the bound attribute has a validation error | Delete the hand-rolled markup; rely on `strata_form_with` + model `validates ... on: :<page>` |
| Step indicator missing on a page | Forgot to render `strata/shared/step_indicator` partial | Add it at the top of every form page (after the layout's `<main>` open) |
| Validation runs on every save and blocks partial drafts | Validation declared without an `on:` context | Add `on: :<page_name>` matching the `question_page` symbol so the SDK only fires it for that page's submit |
| Save and Exit redirects to login or 404 | Forgot to render `strata/shared/exit_link` or pass `exit_path` local | Render the partial on every form page with `exit_path: <model_kebab>s_path` (the member index, NOT a separate `dashboard_path`) |
| `<model_kebab>s#index` returns 500 / "Missing template" on first visit | Route declared in `resources :<model_kebab>s, only: [:index, ...]` but no `index.html.erb` was ever created | Every route in the resources block needs a template and a request spec — see Step 9b's route-to-template matrix. The index spec from Step 10 catches this in CI |
| Index page renders but the "Start a new application" button isn't there | Template was scaffolded by the generator and only renders the tables — the button is host-app-defined, not gem-provided | Add `<%= link_to t("<model_kebab>s.index.start_new"), new_<model_kebab>_path, class: "usa-button" %>` at the top of the index template; the index request spec from Step 10 asserts the link exists |
| Members see other users' applications in the in-progress / completed sections | Controller's `index` queries `<MODEL_NAME>.where(...)` directly instead of scoping through `current_user` | Always scope: `current_user.<model_kebab>s.where(submitted_at: nil)`. The index spec from Step 10 includes a third "other_user_form" fixture specifically to catch this leak |
| Began writing templates immediately after the plan was saved | Skipped the Step 7 confirmation gate — the user hadn't replied "confirm" | Stop. Revert any uncommitted Step 8+ work. Re-ask the user to read the plan and reply with the literal word "confirm" before resuming |
| Review page edit links 404 | Used a raw path instead of `flow_step_path(:<page>)` | Use the flow's named-route helper from the SDK (verify in Step 6b) |
| Confirmation page renders before submission completes | Tested the route by visiting it directly instead of submitting the form | Drive the test via Capybara's `click_on "Submit application"`, not `visit confirmation_path` |
| Member layout reused the staff layout under `layouts/strata/staff.html.erb` | The SDK only ships the staff layout; using it on the member side leaks staff chrome | Create `app/views/layouts/application.html.erb` per [`references/ui-kit-components.md`](references/ui-kit-components.md) |
| `make test` green on the very first run for a new page | Skipped the RED step — no failing spec was written before the template | Revert the template, re-run the spec, watch it fail, then re-implement |
| Visual walk-through skipped because "lint and test are green" | `make test` doesn't catch CSS/USWDS regressions, locale typos, or wrong widget choices | Run the Claude-in-Chrome pass; do not claim done without it |
| `flow_step_path` and the in-built "Review and Submit" link 404 or demand an explicit `locale:` arg | The application-form resources were nested inside `scope "(:locale)" do ... end` | Move them out to the top level of `Rails.application.routes.draw` per Step 9b's canonical pattern |
| Show page renders two "Review and Submit" buttons stacked on top of each other | A submit button was hand-rolled alongside `Strata::Flows::TaskListComponent`, which already ships one | Delete the hand-rolled button; only `<%= render Strata::Flows::TaskListComponent.new(...) %>` |
| Task rows render `translation missing: en.<model_plural>.task_section_component.<task>.title` (and the same for `.description`) | The host app did not define the per-task locale keys — these are NOT shipped by the gem | Add `<model_plural>.task_section_component.<task_name>.{title,description}` to `config/locales/en.yml`; the show-page request spec from Step 10 catches this before it ships |

---

## Reference

- Design patterns: [`references/design-patterns.md`](references/design-patterns.md)
- UI kit components (Strata SDK): [`references/ui-kit-components.md`](references/ui-kit-components.md)
- Ruby version check: [`references/ruby-version-check.md`](references/ruby-version-check.md)
- TDD: [`references/test-driven-development.md`](references/test-driven-development.md)
- Plans: [`references/writing-plans.md`](references/writing-plans.md)
- Verification: [`references/verification.md`](references/verification.md)
- Strata SDK source (authoritative — Step 6 reads these directly): `<SDK_GEM_PATH>/lib/generators/strata/application_form_views/`, `<SDK_GEM_PATH>/app/views/strata/shared/`, `<SDK_GEM_PATH>/app/helpers/strata/form_builder.rb`, `<SDK_GEM_PATH>/app/components/strata/`, `<SDK_GEM_PATH>/lib/strata/flows/`, `<SDK_GEM_PATH>/docs/multi-page-form-flows.md`, `<SDK_GEM_PATH>/docs/strata-form-builder.md`, `<SDK_GEM_PATH>/spec/dummy/app/`.
- Strata SDK upstream: https://github.com/navapbc/strata-sdk-rails
- Sibling skill (run this first if no model exists): [`build-strata-sdk-model`](../build-strata-sdk-model/SKILL.md)
