# UI Kit Components Reference (Strata Rails SDK)

This document describes the components used to build multi-page application portals with the **Strata Rails SDK** (installed as a gem; find its location with `bundle show strata` and refer to it as `<SDK_GEM_PATH>`). The companion HTML prototype and `design-patterns.md` show the same patterns in a React mock — this file is the production reference.

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
          <%= link_to "Dashboard", dashboard_path, class: "usa-nav-link" %>
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

## Dashboard / List Pages

### Application Forms Index (citizen "My applications")

The SDK doesn't ship a citizen-portal dashboard component, but the pattern used by SDK generators is template-based. Render an `index.html.erb` with these locals:

| Local | Type | Notes |
|---|---|---|
| `title` | String | Page heading |
| `intro` | String | Description paragraph |
| `new_button_text` | String | CTA label |
| `new_path` | String | URL for "Start new application" |
| `application_forms` | Array | Each item has `created_at`, `path`, `status` |
| `in_progress_applications_heading` | String | Section heading for in-progress list |

Inside the template, render existing applications in a `Strata::US::TableComponent` (see below) with columns for ID, date, status, and an action link.

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

Three-field date entry (month dropdown, day input, year input) wrapped in a fieldset. This is the helper that matches the React prototype's `DateInput`.

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
  exit_path: dashboard_path,
  exit_text: "Save and exit"
} %>
```

Renders a `usa-link` with an `arrow_back` USWDS sprite icon.

---

### Task List (dashboard-style progress)

**Component:** `Strata::Flows::TaskListComponent` (uses `Strata::Flows::TaskSectionComponent` per row)

```erb
<%= render Strata::Flows::TaskListComponent.new(
  flow: @flow,
  show_step_label: true
) %>
```

Renders each task with a state-appropriate action:
- **Not started** → "Start" primary button
- **In progress** → "Continue" outline button
- **Completed** → checkmark + "Edit" link
- **Dependencies not met** → disabled "Cannot start yet" text

The list ends with a "Review and submit" button (disabled until the flow is complete).

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
| ConditionalFieldComponent | `<SDK_GEM_PATH>/app/components/strata/conditional_field_component.rb` |
| Flow docs | `<SDK_GEM_PATH>/docs/multi-page-form-flows.md` |
| FormBuilder docs | `<SDK_GEM_PATH>/docs/strata-form-builder.md` |
| Dummy app (canonical examples) | `<SDK_GEM_PATH>/spec/dummy/app/` |
