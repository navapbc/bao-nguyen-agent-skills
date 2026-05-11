---
name: build-strata-app-form-views
description: Builds views, flow, and routes for a Strata multi-page application form on top of an existing ApplicationForm model. Use after generating the model with build-strata-sdk-model — covers pages, step indicator, review, and dashboard.
---

# Build Strata App Form Views

## Overview

Builds the **view layer** for a Strata multi-page application form: the citizen-portal layout and shared header partial, the `Strata::Flows::ApplicationFormFlow`-based flow class that declares each `task` / `question_page`, one ERB template per page, a review page, a post-submit confirmation page, and an optional "My applications" dashboard.

**Hard prerequisite:** an `ApplicationForm` subclass already exists in this Rails app (a class extending `Strata::ApplicationForm`). If it does not, **stop** and run [`build-strata-sdk-model`](../build-strata-sdk-model/SKILL.md) first — this skill builds views on top of an existing model and will not invent attributes.

Read these two references **before** writing any view code — together they are the design contract:

- Design patterns (one-question-per-page, save-and-exit, review-before-submit, error messaging, etc.): [`references/design-patterns.md`](references/design-patterns.md)
- UI kit components (form-builder helpers, `Strata::US::TableComponent`, partials, USWDS tokens): [`references/ui-kit-components.md`](references/ui-kit-components.md)

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

The SDK ships only a **staff** layout (`<SDK_GEM_PATH>/app/views/layouts/strata/staff.html.erb`). A citizen-portal layout is **not** provided — see [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Layout / Application Header" for the recommended pattern.

> No citizen-portal layout exists. Options:
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

If yes, ask for the "what happens next" copy (timeline, contact info). Save as `<CONFIRMATION_COPY>`.

**5g. Dashboard.**

> A citizen dashboard lists the user's in-progress and submitted applications using `Strata::US::TableComponent`. Include it? (yes / no — default yes)

Save as `<INCLUDE_DASHBOARD>` (default `true`).

---

## Step 6: Write the plan

Follow [`references/writing-plans.md`](references/writing-plans.md). Save to `<RAILS_DIR>/docs/plans/<YYYY-MM-DD>-<MODEL_KEBAB>-views.md`.

The plan header must list:
- `<MODEL_NAME>` (existing model), `<MODEL_PATH>`, `<FLOW_CLASS>`, `<FLOW_PATH>`
- The full `<PAGES>` × `<TASKS>` matrix — one table row per `question_page` with its `task`, `depends_on`, fields, widgets, and the route `flow_step_path(:<page>)`
- `<LAYOUT_STRATEGY>`, `<INCLUDE_REVIEW>`, `<INCLUDE_DASHBOARD>`, `<CONFIRMATION_COPY>`
- Every locale key needed under `strata.application_forms.steps.*` (one per `question_page`) and any custom keys for review-section headings

Each task in the plan must follow the TDD shape from `writing-plans.md`: failing spec → run red → minimal code → run green → commit. Pages are bite-sized — one page per task.

Tell the user:

> Plan written to `docs/plans/<YYYY-MM-DD>-<MODEL_KEBAB>-views.md`. Reply **confirm** to begin, or describe changes.

Iterate until confirmed.

---

## Step 7: Check what already exists

Before generating, look for collisions:

```sh
ls app/views/layouts/application.html.erb \
   app/views/shared/_header.html.erb \
   <FLOW_PATH> \
   app/controllers/<MODEL_KEBAB>_controller.rb \
   app/views/<MODEL_KEBAB>/ \
   config/locales/en.yml \
   2>/dev/null
grep -n "strata\|<MODEL_KEBAB>" config/routes.rb 2>/dev/null
```

If any expected file already exists, ask the user how to proceed (overwrite vs. extend in place). Do not blindly re-run generators over existing code.

---

## Step 8: Generate scaffolding

**8a. Check for the SDK's `application_form_views` generator:**

```sh
ls <SDK_GEM_PATH>/lib/generators/strata/application_form_views/ 2>/dev/null && \
  cat <SDK_GEM_PATH>/lib/generators/strata/application_form_views/USAGE 2>/dev/null
```

If the generator exists, read its `*_generator.rb` to learn the exact flag spelling (USAGE files may be stale). Typical invocation:

```sh
bin/rails generate strata:application_form_views <PROGRAM>
```

This typically produces: a controller, a `views/` directory with placeholder ERB per page, a route entry, and an English locale stub. After running, **diff every generated file against `<PAGES>`** — the generator's placeholders likely don't match your confirmed widgets. Continue to Step 9 for the TDD-driven edit pass.

**8b. If the generator is absent**, hand-roll the scaffolding:
- Create `<FLOW_PATH>` with the `<FLOW_CLASS>` definition (one `task` block per `<TASKS>` entry, one `question_page` per `<PAGES>` entry, `end_page :review` if `<INCLUDE_REVIEW>`).
- Add the routes per the SDK's flow conventions (read `<SDK_GEM_PATH>/docs/multi-page-form-flows.md` for the canonical route shape).
- Create one ERB template per page under `app/views/<MODEL_KEBAB>/` opening with `strata_form_with(model: @application_form, url: ..., method: :patch)` and the `strata/shared/step_indicator`, `strata/shared/form_buttons`, `strata/shared/exit_link` partials per [`references/ui-kit-components.md`](references/ui-kit-components.md).
- Seed `config/locales/en.yml` with `strata.application_forms.steps.<page>` entries.

**8c. Citizen layout (only if `<LAYOUT_STRATEGY>` = create):**

Create `app/views/layouts/application.html.erb` and `app/views/shared/_header.html.erb` from the templates in [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Layout" and "Application Header".

**8d. Dashboard (only if `<INCLUDE_DASHBOARD>`):**

Create `app/controllers/dashboard_controller.rb` and `app/views/dashboard/index.html.erb` rendering `Strata::US::TableComponent` per [`references/ui-kit-components.md`](references/ui-kit-components.md) → "Application Forms Index".

---

## Step 9: TDD-build / strengthen the views

Per [`references/test-driven-development.md`](references/test-driven-development.md): every page is built test-first.

For each entry in `<PAGES>`, in order:

1. Write a failing **request spec** at `spec/requests/<MODEL_KEBAB>/<page_name>_spec.rb`:
   - `GET` the page's `flow_step_path(:<page>)` and assert response 200 and that each expected label / hint / widget rendered (use `assert_select` or `have_selector` matchers against the USWDS classes from [`references/ui-kit-components.md`](references/ui-kit-components.md)).
   - `PATCH` the page with invalid params and assert the page re-renders with the SDK's `usa-error-message` markup.
   - `PATCH` the page with valid params and assert redirect to the next step.
2. Run `make test spec/requests/<MODEL_KEBAB>/<page_name>_spec.rb` — watch it fail for the right reason (missing template, missing route, missing locale key).
3. Edit (or create) the page's ERB template with the minimum to pass — use the form-builder helpers from [`references/ui-kit-components.md`](references/ui-kit-components.md).
4. Run the same spec — watch it pass.
5. Run `make lint`.
6. Commit with a one-sentence message naming the page added.
7. Repeat for the next page.

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

## Step 10: Verify

Per [`references/verification.md`](references/verification.md), before claiming done — run both, in this same message, and read the full output:

```sh
make lint
make test
```

Both must show fresh, complete output with zero failures.

Then run a **visual walk-through** in Claude in Chrome:
1. Boot `bin/dev` (or `bin/rails server`) in the background.
2. Navigate to the flow's entry route in a new tab.
3. Walk every page — confirm the step indicator updates, labels match the locale entries, validation errors render inline with `usa-error-message`, Back/Continue work, Save and Exit redirects to the dashboard, the review page edit links jump correctly, and the confirmation page renders the success alert with the reference number.
4. Capture any rendering bugs as new failing specs and fix inside the TDD loop — do not silently patch templates.

---

## Step 11: Report

> **Views ready.** Application form `<MODEL_NAME>` now has flow `<FLOW_CLASS>` with `<N>` pages, layout at `app/views/layouts/application.html.erb` (if created), dashboard at `app/views/dashboard/index.html.erb` (if included), review and confirmation pages (if included). Plan at `docs/plans/<YYYY-MM-DD>-<MODEL_KEBAB>-views.md`. `make lint` and `make test` both green. Visual walk-through clean.

---

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `bundle show strata` empty | Gem not in Gemfile, or `bundle install` skipped | Add `gem "strata"`, run `bundle install`, restart |
| Skipped to view-building without finding a model | Skipped Step 3 — no `Strata::ApplicationForm` subclass exists | Stop. Run `build-strata-sdk-model` first |
| Hand-wrote `usa-error-message` markup in a template | Form builder renders this automatically when the bound attribute has a validation error | Delete the hand-rolled markup; rely on `strata_form_with` + model `validates ... on: :<page>` |
| Step indicator missing on a page | Forgot to render `strata/shared/step_indicator` partial | Add it at the top of every form page (after the layout's `<main>` open) |
| Validation runs on every save and blocks partial drafts | Validation declared without an `on:` context | Add `on: :<page_name>` matching the `question_page` symbol so the SDK only fires it for that page's submit |
| Save and Exit redirects to login or 404 | Forgot to render `strata/shared/exit_link` or pass `exit_path` local | Render the partial on every form page with `exit_path: dashboard_path` |
| Review page edit links 404 | Used a raw path instead of `flow_step_path(:<page>)` | Use the flow's named-route helper from the SDK |
| Confirmation page renders before submission completes | Tested the route by visiting it directly instead of submitting the form | Drive the test via Capybara's `click_on "Submit application"`, not `visit confirmation_path` |
| Citizen layout reused the staff layout under `layouts/strata/staff.html.erb` | The SDK only ships the staff layout; using it on the citizen side leaks staff chrome | Create `app/views/layouts/application.html.erb` per [`references/ui-kit-components.md`](references/ui-kit-components.md) |
| `make test` green on the very first run for a new page | Skipped the RED step — no failing spec was written before the template | Revert the template, re-run the spec, watch it fail, then re-implement |
| Visual walk-through skipped because "lint and test are green" | `make test` doesn't catch CSS/USWDS regressions, locale typos, or wrong widget choices | Run the Claude-in-Chrome pass; do not claim done without it |

---

## Reference

- Design patterns: [`references/design-patterns.md`](references/design-patterns.md)
- UI kit components (Strata SDK): [`references/ui-kit-components.md`](references/ui-kit-components.md)
- Ruby version check: [`references/ruby-version-check.md`](references/ruby-version-check.md)
- TDD: [`references/test-driven-development.md`](references/test-driven-development.md)
- Plans: [`references/writing-plans.md`](references/writing-plans.md)
- Verification: [`references/verification.md`](references/verification.md)
- Strata SDK source: read directly from `<SDK_GEM_PATH>` — `lib/generators/strata/application_form_views/`, `app/views/strata/shared/`, `app/helpers/strata/form_builder.rb`, `docs/multi-page-form-flows.md`, `docs/strata-form-builder.md`.
- Strata SDK upstream: https://github.com/navapbc/strata-sdk-rails
- Sibling skill (run this first if no model exists): [`build-strata-sdk-model`](../build-strata-sdk-model/SKILL.md)
