# UI Kit Components Reference (Strata Rails SDK)

This document describes the components used to build multi-page application portals with the **Strata Rails SDK** (installed as a gem; find its location with `bundle show strata` and refer to it as `<SDK_GEM_PATH>`). The companion [`design-patterns.md`](design-patterns.md) documents the pattern principles (one-page-per-question, save and exit, review before submit) — this file is the API reference for the SDK primitives that implement them.

All examples use ERB. The SDK is consumed as a **Rails engine** under the `Strata::` namespace.

---

## SDK Fundamentals

The Strata SDK provides four layers used by every page:

| Layer | What it is | How you use it |
|---|---|---|
| **USWDS** | U.S. Web Design System CSS/JS | Utility classes (`grid-container`, `usa-button`) and component classes (`usa-input`, `usa-alert`) — already loaded by the engine |
| **ViewComponent** | Ruby gem (`view_component >= 4.0.2`) for reusable view objects | Components under `Strata::` (e.g., `Strata::US::TableComponent`) — invoked with `render Strata::Foo.new(...)` |
| **`Strata::FormBuilder`** | Custom Rails form builder | Entered via `strata_form_with` — every field helper auto-wraps label, hint, and error |
| **Flows DSL + `ApplicationForm`** | Multi-page form orchestration + state model | Define a flow class, persist a model with `status` (in_progress/submitted), let the SDK handle pagination |

**Form entrypoint** — every form on every page is opened with:

```erb
<%= strata_form_with(model: @application_form, url: form_path, method: :patch) do |f| %>
  <%= f.text_field :first_name, label: "First name" %>
  <%= f.submit "Save and continue", big: true %>
<% end %>
```

`strata_form_with` is defined in `Strata::ApplicationHelper`; it sets the builder to `Strata::FormBuilder` and applies `usa-form usa-form--large`.

---

## Application Layout

### Page Layout

The SDK ships a staff layout at `app/views/layouts/strata/staff.html.erb`. Citizen-portal applications typically define their own layout following the same skeleton:

```erb
<!-- app/views/layouts/application.html.erb -->
<!DOCTYPE html>
<html lang="<%= I18n.locale %>">
  <head>
    <title><%= content_for(:title) || "Benefits Application Portal" %></title>
    <%= csrf_meta_tags %>
    <%= csp_meta_tag %>
    <%= stylesheet_link_tag "application", "data-turbo-track": "reload" %>
    <%= javascript_importmap_tags %>
  </head>
  <body>
    <%= render "shared/header" %>

    <main id="main-content" class="usa-section">
      <div class="grid-container">
        <div class="grid-row grid-gap">
          <div class="grid-col-12">
            <%= yield %>
          </div>
        </div>
      </div>
    </main>
  </body>
</html>
```

Yield hooks worth knowing (from the staff layout): `:main_col_class`, `:content_col_class`, `:content`, `:sidenav`.

---

### Application Header

> The SDK ships only a **staff-facing** header partial at `app/views/strata/staff/_header.html.erb`. A citizen-facing portal header (with dashboard link, account menu, language selector) is **not** provided — use the pattern below.

**Recommended ERB pattern** — put in `app/views/shared/_header.html.erb`:

```erb
<header class="usa-header usa-header--basic">
  <div class="usa-nav-container">
    <div class="usa-navbar">
      <div class="usa-logo">
        <em class="usa-logo__text">
          <%= link_to "Benefits Application Portal", root_path %>
        </em>
      </div>
      <button class="usa-menu-btn">Menu</button>
    </div>

    <nav aria-label="Primary navigation" class="usa-nav">
      <button class="usa-nav__close">
        <%= image_tag asset_path("@uswds/uswds/dist/img/usa-icons/close.svg"), alt: "Close" %>
      </button>

      <ul class="usa-nav__primary usa-accordion">
        <li class="usa-nav__primary-item">
          <%= link_to "My applications", <model_kebab>s_path, class: "usa-nav-link" %>
        </li>
        <li class="usa-nav__primary-item">
          <%= link_to "My account", account_path, class: "usa-nav-link" %>
        </li>
        <li class="usa-nav__primary-item">
          <%= button_to "Log out", logout_path, method: :delete, class: "usa-nav-link" %>
        </li>
      </ul>

      <div class="usa-nav__secondary">
        <%= link_to "Español", url_for(locale: :es), class: "usa-link" %>
      </div>
    </nav>
  </div>
</header>
```

**USWDS classes:** `usa-header`, `usa-header--basic`, `usa-nav`, `usa-nav__primary`, `usa-nav-link`, `usa-link`.

---

### Step Indicator

**Partial:** `strata/shared/step_indicator` (no ViewComponent class)

**Locals:**
- `steps` `[Array<Symbol, String>]` — ordered step identifiers
- `current_step` `[Symbol, String]` — active step
- `translation_scope` `[String]` (optional) — i18n key prefix; default `strata.application_forms.steps`
- `large_header` `[Boolean]` (optional) — adds `font-heading-xl`
- `header_first` `[Boolean]` (optional) — render header above segments
- `type` `[Symbol]` (optional) — `:counters` for numbered style

Display names are pulled from i18n under `translation_scope`; fall back to humanized symbol.

**Usage:**

```erb
<%= render partial: "strata/shared/step_indicator", locals: {
  steps: [:before_you_start, :personal_info, :contact, :household, :employment, :additional_info, :review, :submit],
  current_step: :personal_info,
  type: :counters
} %>
```

```yaml
# config/locales/en.yml
en:
  strata:
    application_forms:
      steps:
        before_you_start: "Before you start"
        personal_info: "Personal info"
        contact: "Contact"
```

**Segment states** (set automatically based on position vs `current_step`):
- **Complete** — `usa-step-indicator__segment--complete`
- **Current** — `usa-step-indicator__segment--current`
- **Future** — base segment class only

---

## Index / List Pages

### Application Forms Index (citizen "My applications")

The SDK doesn't ship a citizen-portal index component, but the pattern is template-based. This is the page a member lands on after sign-in — it lists their applications and is the only place to start a new one. Build it at `app/views/<model_kebab>s/index.html.erb`.

**Controller contract.** The `index` action must expose two collections, both scoped to `current_user`:

```ruby
# app/controllers/<model_kebab>s_controller.rb
def index
  @in_progress_application_forms = current_user.<model_kebab>s.where(submitted_at: nil).order(updated_at: :desc)
  @completed_application_forms   = current_user.<model_kebab>s.where.not(submitted_at: nil).order(submitted_at: :desc)
end
```

**Template contract.** The template must render three things, in this order:

1. A page heading (`<h1>`).
2. A primary **"Start a new application"** button linking to `new_<model_kebab>_path`. This button must render **even if both collections are empty** — it's the only entry point into the flow.
3. One section per non-empty collection, each rendered with `Strata::US::TableComponent`. Omit a section if its collection is empty (do not render an empty table — render no section).

**Reference template:**

```erb
<%# app/views/<model_kebab>s/index.html.erb %>
<section class="grid-container usa-section">
  <div class="grid-row grid-gap">
    <div class="tablet:grid-col-10">
      <h1><%= t(".title") %></h1>
      <p class="usa-intro"><%= t(".intro") %></p>

      <%= link_to t(".start_new"),
                  new_<model_kebab>_path,
                  class: "usa-button" %>

      <% if @in_progress_application_forms.any? %>
        <h2 class="margin-top-6"><%= t(".in_progress_heading") %></h2>
        <%= render Strata::US::TableComponent.new(
              striped: true,
              stacked: true,
              width_full: true
            ) do |table| %>
          <% table.with_caption { t(".in_progress_caption") } %>
          <% table.with_header { t(".started_on") } %>
          <% table.with_header { t(".last_updated") } %>
          <% table.with_header { t(".actions") } %>

          <% @in_progress_application_forms.each do |form| %>
            <% table.with_row do |row| %>
              <% row.with_cell { l(form.created_at.to_date, format: :long) } %>
              <% row.with_cell { l(form.updated_at, format: :short) } %>
              <% row.with_cell { link_to t(".continue"), <model_kebab>_path(form), class: "usa-link" } %>
            <% end %>
          <% end %>
        <% end %>
      <% end %>

      <% if @completed_application_forms.any? %>
        <h2 class="margin-top-6"><%= t(".completed_heading") %></h2>
        <%= render Strata::US::TableComponent.new(
              striped: true,
              stacked: true,
              width_full: true
            ) do |table| %>
          <% table.with_caption { t(".completed_caption") } %>
          <% table.with_header { t(".submitted_on") } %>
          <% table.with_header { t(".reference_number") } %>
          <% table.with_header { t(".actions") } %>

          <% @completed_application_forms.each do |form| %>
            <% table.with_row do |row| %>
              <% row.with_cell { l(form.submitted_at.to_date, format: :long) } %>
              <% row.with_cell { form.reference_number } %>
              <% row.with_cell { link_to t(".view"), <model_kebab>_path(form), class: "usa-link" } %>
            <% end %>
          <% end %>
        <% end %>
      <% end %>
    </div>
  </div>
</section>
```

**Required locale keys** (host-defined — these are NOT shipped by the gem):

```yaml
# config/locales/en.yml
en:
  <model_kebab>s:
    index:
      title: "My applications"
      intro: "Start a new application or pick up where you left off."
      start_new: "Start a new application"
      in_progress_heading: "In progress"
      in_progress_caption: "Applications you have not yet submitted."
      completed_heading: "Completed"
      completed_caption: "Applications you have submitted."
      started_on: "Started on"
      last_updated: "Last updated"
      submitted_on: "Submitted on"
      reference_number: "Reference number"
      actions: "Actions"
      continue: "Continue"
      view: "View"
```

**Test contract.** The index request spec in the build-strata-app-form-views skill (Step 10) asserts (a) the "Start new" button is always present, (b) both section headings render when their collection has at least one row, (c) the right action link (`Continue` / `View`) appears per row, and (d) applications belonging to other users do not leak into the page. If you change the template, update the spec to match — never the other way around.

---

### Case Index (staff)

**Component:** `Strata::Cases::IndexComponent`
**File:** `app/components/strata/cases/index_component.rb`

```erb
<%= render Strata::Cases::IndexComponent.new(
  cases: @cases,
  model_class: PassportApplicationForm,
  title: "My cases"
) %>
```

Renders title (h1), Open/Closed tabs, and a `TableComponent` of `Strata::Cases::CaseRowComponent` rows. Subclass `CaseRowComponent` to customize columns:

```ruby
class MyCaseRowComponent < Strata::Cases::CaseRowComponent
  self.columns = [:case_id, :status, :created_date, :actions]
end
```

---

## Form Builder Reference

All helpers below are methods on the `f` form builder yielded by `strata_form_with`.

### Common options

Every field helper accepts these options (signatures show only the field-specific ones):

| Option | Type | Notes |
|---|---|---|
| `label` | String | Auto-generated from attribute if omitted; appends `(optional)` if `optional: true` |
| `hint` | String | Help text rendered below the label with `usa-hint` |
| `required` | Boolean | Adds `required` HTML attr |
| `disabled` | Boolean | Disables field |
| `readonly` | Boolean | Read-only field |
| `placeholder` | String | Placeholder text |
| `width` | Symbol/String | Text fields: `:sm`, `:md`, `:lg`, `:xl` → `usa-input--{width}` |
| `inputmode` | String | Mobile keyboard hint (e.g., `"numeric"`, `"decimal"`) |
| `class` | String | Appended to USWDS classes |
| `id` | String | Override generated ID |
| `optional` | Boolean | Appends "(optional)" to label |
| `skip_form_group` | Boolean | Render field without `usa-form-group` wrapper |
| `group_options` | Hash | Options passed to surrounding `form_group` |

Errors on the bound attribute are rendered automatically (`usa-error-message`) and add `usa-input--error` to the input.

---

### `text_field`

Single-line text entry.

```erb
<%= f.text_field :first_name, label: "First name", width: :md %>

<%= f.text_field :phone, label: "Phone number",
                          hint: "Include area code, e.g., 555-555-5555",
                          inputmode: "tel" %>

<%= f.text_field :email, label: "Email address" %>
```

---

### `text_area`, `file_field`

Standard Rails helpers wrapped with USWDS styling. Same option surface as `text_field`.

```erb

<%= f.text_area :additional_info,
                label: "Anything else we should know?",
                hint: "Optional",
                rows: 6 %>

<%= f.file_field :proof_of_income,
                 label: "Upload documents",
                 hint: "PDF, JPG, or PNG",
                 accept: ".pdf,.jpg,.jpeg,.png",
                 multiple: true %>
```

---

### `tax_id_field`

Masked numeric input for SSN / EIN. Defaults: `inputmode: "numeric"`, `placeholder: "_________"`, `width: :md`, `usa-masked` class, and an automatic hint showing format.

```erb
<%= f.tax_id_field :ssn, label: "Social Security Number" %>
```

---

### `select` + `us_states_and_territories`

Dropdown. Choices passed as Rails `[[label, value], ...]` pairs or an options hash.

```erb
<%= f.select :state,
             [["- Select -", ""], ["Alabama", "AL"], ["Alaska", "AK"]],
             label: "State",
             required: true %>
```

For the 60-entry U.S. states + territories list, use the bundled helper:

```erb
<%= f.select :state, f.us_states_and_territories, label: "State" %>
```

---

### `radio_button`

Single-selection radio. Tile style enabled by default (`tile: true`). Group multiple `radio_button` calls inside a `fieldset` for an accessible group.

```erb
<%= f.fieldset("Marital status") do %>
  <%= f.radio_button :marital_status, "single",   label: "Single" %>
  <%= f.radio_button :marital_status, "married",  label: "Married" %>
  <%= f.radio_button :marital_status, "divorced", label: "Divorced" %>
<% end %>
```

---

### `yes_no`

Boolean radio pair wrapped in a fieldset. Labels are pulled from i18n keys `strata.form_builder.boolean_true` / `boolean_false`.

```erb
<%= f.yes_no :is_us_citizen, legend: "Are you a U.S. citizen?" %>
```

---

### `check_box`

Tile-style checkbox. For multi-select groups, wrap multiple `check_box` calls bound to an array attribute in a fieldset.

```erb
<%= f.check_box :subscribe_to_updates, label: "Send me program updates" %>

<%= f.fieldset("Income sources") do %>
  <%= f.check_box :income_sources, { label: "Employment", multiple: true }, "employment" %>
  <%= f.check_box :income_sources, { label: "Self-employment", multiple: true }, "self_employment" %>
  <%= f.check_box :income_sources, { label: "Social Security", multiple: true }, "social_security" %>
<% end %>
```

---

### `date_picker`

JavaScript-enhanced single date picker. Input format is `MM/DD/YYYY`; stored as ISO `YYYY-MM-DD`.

```erb
<%= f.date_picker :appointment_date, label: "Appointment date" %>
```

---

### `memorable_date`

Three-field date entry (month dropdown, day input, year input) wrapped in a fieldset.

```erb
<%= f.memorable_date :date_of_birth,
                     legend: "Date of birth",
                     hint: "For example: January 28 1986" %>
```

---

### `date_range`

Paired `date_picker` fields (start + end) in a single fieldset.

```erb
<%= f.date_range :employment_dates, legend: "Employment period" %>
```

Generated attribute names: `{attribute}_start`, `{attribute}_end`.

---

### `money_field`

Currency input with `inputmode: "decimal"`. Expects the bound attribute to be a `Money` object (extracts `dollar_amount`).

```erb
<%= f.money_field :monthly_income, label: "Monthly income", hint: "Before taxes" %>
```

---

### `name`

Grouped name fields (first / middle / last / suffix) in a fieldset with autocomplete hints.

```erb
<%= f.name :applicant_name,
           legend: "Your name",
           first_hint: "Your legal first name",
           last_hint: "Your legal last name" %>
```

Generated attribute names: `{attribute}_first`, `{attribute}_middle`, `{attribute}_last`, `{attribute}_suffix`.

---

### `address_fields`

Grouped address fields (street line 1, street line 2 (optional), city, state, ZIP) in a fieldset. State uses `us_states_and_territories`; ZIP enforces `[0-9]{5}(-[0-9]{4})?`.

```erb
<%= f.address_fields :mailing_address, legend: "Mailing address" %>
```

Generated attribute names: `{attribute}_street_line_1`, `{attribute}_street_line_2`, `{attribute}_city`, `{attribute}_state`, `{attribute}_zip_code`.

---

### `fieldset`, `form_group`, `hint`

Layout / wrapping helpers.

```erb
<%= f.fieldset("Contact information", large_legend: true) do %>
  <%= f.text_field :phone %>
  <%= f.email_field :email %>
<% end %>

<%= f.form_group(:email) do %>
  <%= f.email_field :email, skip_form_group: true %>
<% end %>

<%= f.hint("This field is used to verify your identity.") %>
```

---

### `conditional`

Show/hide a block based on another field's value (JS-driven; clears hidden values when `clear: true`).

```erb
<%= f.yes_no :has_dependents, legend: "Do you have dependents?" %>

<%= f.conditional(:has_dependents, eq: true) do %>
  <%= f.text_field :dependents_count, label: "How many dependents?", inputmode: "numeric" %>
<% end %>
```

Backed by `Strata::ConditionalFieldComponent`.

---

### `submit`

Submit button. Pass `big: true` for `usa-button--big`.

```erb
<%= f.submit "Save and continue", big: true %>
```

---

### `honeypot_field`

Hidden anti-spam field. Add once per public form.

```erb
<%= f.honeypot_field %>
```

---

## Navigation

### Form Buttons (Back / Save and Continue)

**Partial:** `strata/shared/form_buttons`

```erb
<%= render partial: "strata/shared/form_buttons", locals: {
  back_path: previous_step_path,
  f: f
} %>
```

Renders a `<hr>` divider above and a `usa-button-group` containing an outline Back link and a primary Save and Continue submit. Button labels come from i18n keys `strata.form_builder.actions.back` and `strata.form_builder.actions.save_and_continue`.

---

### Save and Exit Link

**Partial:** `strata/shared/exit_link`

```erb
<%= render partial: "strata/shared/exit_link", locals: {
  exit_path: <model_kebab>s_path,
  exit_text: "Save and exit"
} %>
```

`exit_path` should point at the citizen index page (`<model_kebab>s_path`, the application form resource's own `index` route — see "Application Forms Index" above), NOT a separate `dashboard_path`. The SDK persists draft state on every PATCH, so when the citizen returns to the index they'll see their in-progress form in the In-progress section.

Renders a `usa-link` with an `arrow_back` USWDS sprite icon.

---

### Task List (`Strata::Flows::TaskListComponent`)

The canonical landing component for an application form's show page. Renders one row per `task` declared on the flow, plus a built-in "Review and Submit" button at the end of the list.

**Component:** `Strata::Flows::TaskListComponent` (renders `Strata::Flows::TaskSectionComponent` per row)
**Source:** `<SDK_GEM_PATH>/app/components/strata/flows/task_list_component.rb` + `.html.erb`

**Constructor:**

| Arg | Type | Default | Notes |
|---|---|---|---|
| `flow:` | `Strata::Flows::ApplicationFormFlow` instance | required | The flow object the controller instantiated for this record |
| `task_section_component_class:` | Class | `Strata::Flows::TaskSectionComponent` | Subclass to override per-row rendering |
| `show_step_label:` | Boolean | `false` | When `true`, prefixes each row with "Step N" |

**Usage:**

```erb
<%= render Strata::Flows::TaskListComponent.new(flow: @flow, show_step_label: true) %>
```

**What the component renders, automatically:**

| Region | Behavior |
|---|---|
| Per-row action button | `Start` / `Continue` / `Edit` / "Cannot start yet" — chosen by task state (not started / in progress / completed / dependencies not met). Labels come from the gem's own locale file (`task_section_component.en.yml`); host apps do NOT redefine these. |
| Per-row title + description | Read from host-app i18n — see below. Missing keys render visible `translation missing: …` text. |
| "Review and Submit" button | Rendered at the end of the list. Label from `actions.review_and_submit` (gem-owned). Links to `@flow.end_path`. **Disabled until `@flow.completed?` returns true.** Host apps must NOT render their own — the component ships one. |

**Per-task title and description — host-app locale keys.**

`TaskSectionComponent` reads each row's heading and body from a translation prefix derived at runtime:

```
{plural_model_name}.task_section_component.{task_name}.title
{plural_model_name}.task_section_component.{task_name}.description
```

The plural model name is `@flow.record.class.name.underscore.pluralize`, and `task_name` is the symbol passed to `task :…` in the flow. The host app must define these in `config/locales/*.yml`:

```yaml
en:
  benefits_application_forms:        # plural of BenefitsApplicationForm
    task_section_component:
      personal_information:          # matches `task :personal_information`
        title: "Personal information"
        description: "Tell us about yourself. You'll need your SSN or ITIN."
      employment_details:
        title: "Employment"
        description: "Tell us about your employer."
```

For a worked example see `<SDK_GEM_PATH>/spec/dummy/config/locales/sample_applications/en.yml`.

**Testing the wiring.** The titles and descriptions are the only host-defined strings on the component — assert them via `I18n.t(...)` in a request spec for the show page so a missing key fails the build, not just the visual review:

```ruby
it "renders each task's title and description from i18n" do
  get application_form_path(application_form)

  expect(response.body).to include(I18n.t("benefits_application_forms.task_section_component.personal_information.title"))
  expect(response.body).to include(I18n.t("benefits_application_forms.task_section_component.personal_information.description"))
end
```

References inside the gem: `<SDK_GEM_PATH>/app/components/strata/flows/task_section_component.rb` (the `translation_prefix` method) and `<SDK_GEM_PATH>/app/components/strata/flows/task_section_component.html.erb` (where `title` and `description` are looked up).

---

### Application Form Show Page

The show page for an in-progress application form is a task-list landing page, not a form. It renders `TaskListComponent` and nothing else by way of submit chrome — the component ships the "Review and Submit" button.

**Canonical pattern** (from `<SDK_GEM_PATH>/spec/dummy/app/views/sample_application_forms/show.html.erb`):

```erb
<%# app/views/<model_kebab>/show.html.erb %>
<% if @application_form.submitted? %>
  <%# Submitted view — render the post-submission confirmation/summary template here %>
<% else %>
  <% content_for :title, t(".in_progress_title") %>
  <h1><%= t(".in_progress_title") %></h1>
  <p><%= t(".in_progress_description") %></p>

  <%= render Strata::Flows::TaskListComponent.new(flow: @flow, show_step_label: true) %>
<% end %>
```

Required host-app locale keys for this page:

```yaml
en:
  benefits_application_forms:
    show:
      in_progress_title: "Your in-progress application"
      in_progress_description: "Your progress is automatically saved as you complete the application."
```

**Don'ts:**

- **Do not add a second "Review and Submit" button.** `TaskListComponent` already renders one, and a second copy will sit alongside the first.
- **Do not gate the submit button yourself.** The component already disables it until `@flow.completed?` — duplicating the gate causes drift.
- **Do not embed `strata_form_with` here.** This page is read-only chrome; the form happens on each `question_page`.

---

## Review / Summary Pages

The SDK does not ship a dedicated review-section component. Use a simple ERB pattern with USWDS form-group classes and edit links pointing back into the flow:

```erb
<section class="margin-bottom-4">
  <div class="display-flex flex-justify">
    <h2 class="font-heading-lg">Personal information</h2>
    <%= link_to "Edit", flow_step_path(:personal_info), class: "usa-link" %>
  </div>

  <dl class="grid-row grid-gap">
    <dt class="grid-col-12 tablet:grid-col-4 text-bold">First name</dt>
    <dd class="grid-col-12 tablet:grid-col-8"><%= @form.first_name %></dd>

    <dt class="grid-col-12 tablet:grid-col-4 text-bold">Date of birth</dt>
    <dd class="grid-col-12 tablet:grid-col-8"><%= l(@form.date_of_birth, format: :long) %></dd>
  </dl>
</section>
```

---

## Alerts

USWDS alert variants (`--success`, `--info`, `--warning`, `--error`). Inline ERB — no SDK component layer.

**Success (post-submission confirmation):**

```erb
<div class="usa-alert usa-alert--success">
  <div class="usa-alert__body">
    <h2 class="usa-alert__heading">Your application has been submitted</h2>
    <p class="usa-alert__text">Your reference number is <strong><%= @form.reference_number %></strong>.</p>
  </div>
</div>
```

**Info (the SDK ships one example):**

`app/views/strata/tasks/_no_tasks_alert.html.erb`:

```erb
<div class="usa-alert usa-alert--info usa-alert--no-icon">
  <div class="usa-alert__body">
    <p class="usa-alert__text"><%= t("strata.tasks.partials.no_tasks_alert.message") %></p>
  </div>
</div>
```

---

## Icons

USWDS SVG sprite — no dedicated icon component, inline reference:

```erb
<svg class="usa-icon" aria-hidden="true" focusable="false" role="img">
  <use href="<%= asset_path("@uswds/uswds/dist/img/sprite.svg#arrow_back") %>"></use>
</svg>
```

Common sprite names used in SDK templates: `arrow_back` (exit link), `check` (completed task), `close` (header menu), `save`. Full list at `node_modules/@uswds/uswds/dist/img/sprite.svg`.

---

## Other ViewComponents

### `Strata::US::TableComponent`

Block API table. Use for application lists, case rows, summary data.

```erb
<%= render Strata::US::TableComponent.new(
  borderless: true,
  striped: true,
  stacked: true,
  scrollable: true,
  sortable: false,
  width_full: true
) do |table| %>
  <% table.with_caption { "Your applications" } %>
  <% table.with_header { "Type / ID" } %>
  <% table.with_header { "Submitted" } %>
  <% table.with_header { "Status" } %>
  <% table.with_header { "Actions" } %>

  <% @applications.each do |app| %>
    <% table.with_row do |row| %>
      <% row.with_cell { app.reference_number } %>
      <% row.with_cell { l(app.submitted_at, format: :short) } %>
      <% row.with_cell { app.status.humanize } %>
      <% row.with_cell { link_to "View", application_path(app), class: "usa-link" } %>
    <% end %>
  <% end %>
<% end %>
```

**Options:** `borderless`, `striped`, `compact`, `stacked`, `stacked_header`, `width_full`, `scrollable`, `sticky_header`, `sortable`.

---

### `Strata::US::AccordionComponent`

```erb
<%= render Strata::US::AccordionComponent.new(
  heading_tag: :h3,
  is_bordered: true,
  is_multiselectable: false
) do |a| %>
  <% a.with_heading(expanded: true,  controls: "a1") { "What documents do I need?" } %>
  <% a.with_body(id: "a1") { "You'll need proof of identity and income..." } %>

  <% a.with_heading(expanded: false, controls: "a2") { "How long does review take?" } %>
  <% a.with_body(id: "a2") { "Most applications are reviewed within 10 business days." } %>
<% end %>
```

Heading count and body count must match.

---

### `Strata::ConditionalFieldComponent`

Direct usage (prefer `f.conditional` from the form builder):

```erb
<%= render Strata::ConditionalFieldComponent.new(
  source: "application_form[has_employer]",
  match: "true",
  initially_visible: false,
  clear: true
) do %>
  <%= f.text_field :employer_name, label: "Employer name" %>
<% end %>
```

---

## Multi-Page Form Flow

The SDK uses a **Flow DSL** + a persisted **ApplicationForm** model. The framework handles pagination, validation per step, and draft state.

### Flow definition

```ruby
# app/flows/benefits_application_flow.rb
class BenefitsApplicationFlow
  include Strata::Flows::ApplicationFormFlow

  task :personal_information do
    question_page :name,           fields: [applicant_name: [:first, :middle, :last, :suffix]]
    question_page :date_of_birth,  fields: [date_of_birth: [:month, :day, :year]]
  end

  task :contact, depends_on: [:personal_information] do
    question_page :email, fields: [:email]
    question_page :phone, fields: [:phone]
  end

  task :household, depends_on: [:contact] do
    question_page :marital_status,  fields: [:marital_status]
    question_page :household_size,  fields: [:household_size]
  end

  task :employment, depends_on: [:household] do
    question_page :status,          fields: [:employment_status]
    question_page :income,          fields: [:monthly_income, :income_sources]
  end

  end_page :review
end
```

### ApplicationForm model

```ruby
# app/models/benefits_application_form.rb
class BenefitsApplicationForm < Strata::ApplicationForm
  # status enum is inherited: :in_progress / :submitted
  # Strata::ApplicationForm freezes the record on submit and publishes events.

  validates :applicant_name_first, presence: true, on: :name
  validates :date_of_birth,        presence: true, on: :date_of_birth
  validates :email,                presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }, on: :email
  # ...one validation context per question_page
end
```

Each `question_page` runs validations with `on: <page_name>` so users can save partial drafts and only get errors for the page they're on.

### Question page view

Generated views call `strata_form_with` on the application form, render only the fields for the current page, and include the back/continue + exit-link partials.

For full DSL reference see `<SDK_GEM_PATH>/docs/multi-page-form-flows.md`.

---

## USWDS Design Tokens

### Colors

USWDS CSS custom properties (available globally once USWDS is loaded):

```css
--usa-primary:        #005ea2;
--usa-primary-dark:   #1a4480;
--usa-success:        #00a91c;
--usa-error:          #d54309;
--usa-base:           #71767a;
--usa-base-lighter:   #dfe1e2;
--usa-base-lightest:  #f0f0f0;
```

### Typography

```css
--usa-font-body:        "Source Sans Pro", sans-serif;
--usa-font-heading:     "Merriweather", serif;
--usa-font-public-sans: "Public Sans", sans-serif;
```

### Utility classes commonly used in SDK templates

| Class | Purpose |
|---|---|
| `grid-container` | Max-width centered wrapper |
| `grid-row` `grid-gap` | Flex row + gap |
| `grid-col-12`, `grid-col-fill` | Full / flex-1 column |
| `usa-section` | Vertical section padding |
| `display-flex` `flex-column` `flex-justify` `flex-align-center` | Flexbox utilities |
| `margin-top-2`, `margin-bottom-4`, `padding-y-1` | Spacing units (each = 8px) |
| `text-primary-dark` `text-success` `text-bold` | Text color/weight |
| `font-heading-xl` `font-heading-lg` | Heading size overrides |
| `minh-viewport` | `min-height: 100vh` |
| `usa-sr-only` | Visually hidden, screen-reader available |

---

## Responsive Patterns

USWDS ships responsive variants of every utility class. Use prefix variants directly in `class:`:

```erb
<div class="grid-col-12 tablet:grid-col-6 desktop:grid-col-4">
  <%= f.text_field :first_name, label: "First name" %>
</div>
```

**Breakpoints** (USWDS defaults):
- `mobile-lg:` ≥ 480px
- `tablet:` ≥ 640px
- `desktop:` ≥ 1024px
- `widescreen:` ≥ 1400px

Review-page row layout (stacked on mobile, side-by-side on tablet+):

```erb
<dl class="grid-row grid-gap">
  <dt class="grid-col-12 tablet:grid-col-4 text-bold">Field label</dt>
  <dd class="grid-col-12 tablet:grid-col-8">Field value</dd>
</dl>
```

Full reference: https://designsystem.digital.gov/utilities/

---

## Key SDK File Locations

| Concern | Path |
|---|---|
| FormBuilder | `<SDK_GEM_PATH>/app/helpers/strata/form_builder.rb` |
| Step indicator partial | `<SDK_GEM_PATH>/app/views/strata/shared/_step_indicator.html.erb` |
| Form buttons partial | `<SDK_GEM_PATH>/app/views/strata/shared/_form_buttons.html.erb` |
| Exit link partial | `<SDK_GEM_PATH>/app/views/strata/shared/_exit_link.html.erb` |
| Staff layout | `<SDK_GEM_PATH>/app/views/layouts/strata/staff.html.erb` |
| TableComponent | `<SDK_GEM_PATH>/app/components/strata/us/table_component.rb` |
| AccordionComponent | `<SDK_GEM_PATH>/app/components/strata/us/accordion_component.rb` |
| Case index | `<SDK_GEM_PATH>/app/components/strata/cases/index_component.rb` |
| TaskListComponent | `<SDK_GEM_PATH>/app/components/strata/flows/task_list_component.rb` |
| TaskListComponent button label (gem-owned) | `<SDK_GEM_PATH>/app/components/strata/flows/task_list_component.en.yml` |
| TaskSectionComponent (per-row template + state) | `<SDK_GEM_PATH>/app/components/strata/flows/task_section_component.rb` |
| TaskSectionComponent action labels (gem-owned) | `<SDK_GEM_PATH>/app/components/strata/flows/task_section_component.en.yml` |
| ConditionalFieldComponent | `<SDK_GEM_PATH>/app/components/strata/conditional_field_component.rb` |
| Flow docs | `<SDK_GEM_PATH>/docs/multi-page-form-flows.md` |
| FormBuilder docs | `<SDK_GEM_PATH>/docs/strata-form-builder.md` |
| Dummy app (canonical examples) | `<SDK_GEM_PATH>/spec/dummy/app/` |
