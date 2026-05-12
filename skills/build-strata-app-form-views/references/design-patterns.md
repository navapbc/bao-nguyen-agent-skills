# Multi-Page Form Design Patterns

This document outlines the design patterns used in the Strata SDK multi-page application forms, based on USWDS best practices and government service design standards.

Code examples use the **Strata Rails SDK** (ERB + ViewComponent + `Strata::FormBuilder`). For the full API surface of each helper, partial, and ViewComponent referenced below, see [`ui-kit-components.md`](ui-kit-components.md).

## Core Principles

### 1. One Thing Per Page
**Pattern**: Each page should ask about one topic or decision point.

**Why**: Reduces cognitive load, makes progress clear, easier to understand and complete.

**Example**:
- ✅ Good: Page 1 asks for name, Page 2 asks for date of birth and contact
- ❌ Bad: One page with name, DOB, contact, address, employment all together

**Exceptions**:
- Related fields that form a single concept (e.g., first/middle/last name)
- Short forms (< 5 questions total) where splitting feels excessive

In the Strata SDK each "one thing" is a `question_page` inside a `task` block on the Flow class — the framework renders one page at a time and runs only that page's validations.

---

### 2. Show Progress
**Pattern**: Always indicate how far through the process the user is.

**Why**: Reduces anxiety about form length, motivates completion, sets expectations.

**Implementation**:
- Step indicator at top of every form page
- "X of Y" counter
- Progress bar showing completed/current/future steps
- Step labels describing each section

Render the SDK partial on every form page:

```erb
<%= render partial: "strata/shared/step_indicator", locals: {
  steps: [:before_you_start, :personal_info, :contact, :household, :employment, :additional_info, :review, :submit],
  current_step: :personal_info,
  type: :counters
} %>
```

Step display names come from i18n under `strata.application_forms.steps.*`. See ui-kit-components.md → "Step Indicator".

**Don't**:
- Hide the step indicator
- Use vague labels like "Step 1, Step 2"
- Change the total number mid-flow

---

### 3. Task-List Landing Page

**Pattern**: An application form's "home" page is a list of tasks, not a wall of fields.

**Why**: Multi-task forms are too big to display on one page. The user needs to see which sections are done, which are in progress, and which are still locked — and they need a single, clear way to submit when everything is complete.

**Implementation**:

- The show page renders `Strata::Flows::TaskListComponent`. Each row shows the task title, description, and a state-appropriate action (Start / Continue / Edit / "Cannot start yet").
- The component renders a single **"Review and Submit"** button at the bottom of the list. It is disabled automatically until every task is complete — host code does not gate it.
- Per-task title and description text is host-defined in i18n under `<model_plural>.task_section_component.<task_name>.{title,description}`. Per-row action labels (Start, Continue, Edit, Step) are gem-owned and need no host overrides.

```erb
<%= render Strata::Flows::TaskListComponent.new(flow: @flow, show_step_label: true) %>
```

**Don't**:
- Render a second "Review and Submit" button alongside the component.
- Try to gate the submit button yourself — the framework already disables it until `@flow.completed?`.
- Hand-roll a fields-on-show-page UI for a multi-task form. If a form only has one task, this pattern doesn't apply; use a single-page form instead.

See ui-kit-components.md → "Task List" and "Application Form Show Page".

---

### 4. Save and Exit
**Pattern**: Let users save their progress and return later.

**Why**: Real-world interruptions happen, forms take time, trust-building.

**Implementation**:
- "Save and exit" link on every form page (except intro/confirmation)
- Render `strata/shared/exit_link` for the link itself
- Auto-restore draft on return

In the Strata SDK draft state is server-side: every `Save and continue` submit persists the page's fields to the `ApplicationForm` record (which starts with `status: :in_progress`). There's no client-side `localStorage` work to do — the next visit reloads the same record at the last completed step.

```erb
<%= render partial: "strata/shared/exit_link", locals: {
  exit_path: dashboard_path,
  exit_text: "Save and exit"
} %>
```

See ui-kit-components.md → "Save and Exit Link" and "Multi-Page Form Flow → ApplicationForm model".

---

### 5. Review Before Submit
**Pattern**: Show a summary page where users can review and edit answers before final submission.

**Why**: Catch mistakes, build confidence, final verification.

**Implementation**:
- Dedicated review page before confirmation (declare with `end_page :review` in the Flow DSL)
- Group answers by section matching form flow
- Edit links that jump back to specific pages via `flow_step_path(:section_name)`
- Clear "Submit" button on the review page itself, distinct from the per-page "Save and continue"
- The link **into** the review page from the show / task-list landing is rendered automatically by `Strata::Flows::TaskListComponent` — do not hand-roll a second "Review and Submit" button on the show page

**Structure**:
```
Section 1: Personal Information [Edit]
  Name: Jane Smith
  DOB: 04/28/1986

Section 2: Contact [Edit]
  Email: jane@example.com
  Phone: 555-555-5555

[Back] [Submit Application]
```

**ERB pattern** (one section per source page):

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

See ui-kit-components.md → "Review / Summary Pages".

---

### 6. Confirmation Page
**Pattern**: After submission, show a confirmation page with next steps and reference number.

**Why**: Provides closure, gives users proof, explains what happens next.

**Include**:
- Success message
- Reference/confirmation number
- What happens next (timeline, next steps)
- How to contact with questions
- Option to print or email confirmation

Use a USWDS success alert:

```erb
<div class="usa-alert usa-alert--success">
  <div class="usa-alert__body">
    <h2 class="usa-alert__heading">Your application has been submitted</h2>
    <p class="usa-alert__text">Your reference number is <strong><%= @form.reference_number %></strong>.</p>
  </div>
</div>
```

See ui-kit-components.md → "Alerts".

---

## Form Page Structure

### Page Anatomy

```
┌─────────────────────────────────┐
│ Application Header              │ ← Portal title, nav, language
├─────────────────────────────────┤
│ Step Indicator                  │ ← Progress bar, step labels
├─────────────────────────────────┤
│ Save and Exit                   │ ← Right-aligned save button
├─────────────────────────────────┤
│                                 │
│ Page Heading (H1)              │ ← Question or section title
│ Helper text (optional)         │ ← Additional context
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Form Field 1                │ │ ← Input with label, hint, error
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Form Field 2                │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Back]             [Continue]  │ ← Navigation buttons
│                                 │
└─────────────────────────────────┘
```

Each region maps to a Strata SDK primitive:

| Region | Primitive |
|---|---|
| Application Header | App-level partial (`shared/_header.html.erb`) — see ui-kit-components.md → "Application Header" |
| Step Indicator | `strata/shared/step_indicator` partial |
| Save and Exit | `strata/shared/exit_link` partial |
| Form Fields | `strata_form_with` + builder helpers (`f.text_field`, `f.memorable_date`, etc.) |
| Back / Continue | `strata/shared/form_buttons` partial |

### Spacing Hierarchy
- **Between sections**: 3-4rem
- **Between fields**: 1.5-2rem  
- **Within field groups**: 1rem
- **Label to input**: 0.5rem
- **Hint to input**: 0.25rem

---

## Field Patterns

### Text Input Sizing

**Pattern**: Size inputs to match expected content length.

```erb
<%# Name fields — medium %>
<%= f.text_field :first_name, label: "First name", width: :md %>

<%# ZIP code — small %>
<%= f.text_field :zip_code, label: "ZIP code", width: :sm, maxlength: 5 %>

<%# Email — default (full width) %>
<%= f.email_field :email, label: "Email address" %>
```

Width tokens: `:sm`, `:md`, `:lg`, `:xl`. See ui-kit-components.md → "text_field".

**Why**: Visual affordance about expected input length.

---

### Date Input Pattern

**Pattern**: Use three separate fields for month, day, year.

**Why**: Clearer than MM/DD/YYYY placeholder, works better internationally, avoids date picker complexity.

```
Month    Day      Year
┌──┐     ┌──┐     ┌────┐
│MM│     │DD│     │YYYY│
└──┘     └──┘     └────┘
```

Use the `memorable_date` builder helper:

```erb
<%= f.memorable_date :date_of_birth,
                     legend: "Date of birth",
                     hint: "For example: January 28 1986" %>
```

For a single-field calendar picker instead, use `f.date_picker`. See ui-kit-components.md → "memorable_date" / "date_picker".

---

### Address Fields

**Pattern**: Separate fields for street, city, state, ZIP.

**Why**: Structured data, easier validation, international compatibility.

```
Street address 1 *
┌─────────────────────────────┐
└─────────────────────────────┘

Street address 2 (optional)
┌─────────────────────────────┐
└─────────────────────────────┘

City *              State *    ZIP code *
┌─────────────┐     ┌─────┐    ┌─────┐
└─────────────┘     └─────┘    └─────┘
```

The SDK ships a grouped helper that emits the whole block (street line 1/2, city, state dropdown, ZIP with `[0-9]{5}(-[0-9]{4})?` validation):

```erb
<%= f.address_fields :mailing_address, legend: "Mailing address" %>
```

Generated attribute names: `mailing_address_street_line_1`, `mailing_address_street_line_2`, `mailing_address_city`, `mailing_address_state`, `mailing_address_zip_code`. See ui-kit-components.md → "address_fields".

---

### Radio vs. Select

**Pattern**: 
- Use radio buttons for 2-5 options
- Use select dropdown for 6+ options
- Use radio for critical decisions

**Why**: Radio shows all options at once, select hides them until clicked.

**Example**:

```erb
<%# Radio — clear choice (2–5 options) %>
<%= f.fieldset("Marital status") do %>
  <%= f.radio_button :marital_status, "single",   label: "Single" %>
  <%= f.radio_button :marital_status, "married",  label: "Married" %>
  <%= f.radio_button :marital_status, "divorced", label: "Divorced" %>
  <%= f.radio_button :marital_status, "widowed",  label: "Widowed" %>
<% end %>

<%# Select — many options %>
<%= f.select :state, f.us_states_and_territories, label: "State", required: true %>
```

For boolean questions use `f.yes_no` (renders a fieldset with Yes/No radios pulled from i18n). See ui-kit-components.md → "radio_button", "select", "yes_no".

---

### Optional Fields

**Pattern**: Mark required fields, not optional ones.

**Why**: Most fields are usually required; marking all of them is redundant.

```erb
<%= f.text_field :first_name, label: "First name", required: true %>
<%= f.text_field :last_name,  label: "Last name",  required: true %>
<%= f.text_field :middle_name, label: "Middle name", optional: true %>
```

`optional: true` appends "(optional)" to the rendered label. `required: true` adds the HTML `required` attribute and the asterisk styling. See ui-kit-components.md → "Common options".

---

## Validation Patterns

### When to Validate

**Pattern**: Validate on Save and continue, not on every keystroke.

**Why**: Prevents premature error messages while user is typing.

**Implementation**: Declare validations per page on the `ApplicationForm` model using Rails' `on:` validation context — the framework runs only that page's validations when its form submits:

```ruby
class BenefitsApplicationForm < Strata::ApplicationForm
  validates :first_name,      presence: true, on: :name
  validates :date_of_birth,   presence: true, on: :date_of_birth
  validates :email,           presence: true,
                              format: { with: URI::MailTo::EMAIL_REGEXP },
                              on: :email
end
```

There is no client-side validation orchestration — the page re-renders with errors if validations fail on submit. See ui-kit-components.md → "Multi-Page Form Flow → ApplicationForm model".

**Exception**: Format hints (e.g., phone number auto-formatting, masked SSN via `f.tax_id_field`) can happen on input via the existing USWDS / SDK JS — that's display, not validation.

---

### Error Message Patterns

**Pattern**: Errors should be clear, specific, and actionable.

**Structure**:
```
┌───────────────────────────────────┐
│ ⚠ Enter your first name           │ ← Red text, clear action
│ First name *                      │ ← Label repeats for context
│ ┌───────────────────────────────┐ │
│ │                               │ │ ← Red border on input
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

When a model validation fails, the Strata form builder renders this automatically — the input gets `usa-input--error` plus `aria-invalid="true"`, and a `usa-error-message` span is inserted, linked via `aria-describedby`. You do not write the error markup by hand.

**Error Message Formula**:
1. Action verb (Enter, Select, Choose)
2. What they need to provide
3. Why if not obvious

**Examples**:
- ✅ "Enter your first name"
- ✅ "Select your marital status"
- ✅ "Enter a date in the past"
- ❌ "Required field"
- ❌ "Invalid input"
- ❌ "Error"

Set messages via Rails i18n (`activemodel.errors.models.benefits_application_form.attributes.<field>.<rule>`) or via the validator's `message:` option.

---

### Inline vs. Summary Errors

**Pattern**: Show errors inline (next to field) for multi-page forms.

**Why**: User only sees the current page, summary at top would be off-screen.

**Summary errors** are for single-page forms only.

---

## File Upload Patterns

### Drag and Drop

**Pattern**: Large drop zone with clear instructions and fallback button.

**Structure**:
```
┌─────────────────────────────────┐
│         ┌─ ─ ─ ─ ─ ─ ─ ─ ┐      │
│         │                 │      │
│         │  Drag files here or   │
│         │  choose from folder   │
│         │                 │      │
│         └─ ─ ─ ─ ─ ─ ─ ─ ┘      │
└─────────────────────────────────┘

Uploaded files:
• document.pdf         [Remove]
• photo.jpg            [Remove]

[Upload document(s)]

[Continue]
```

The drag-and-drop chrome, file list, and remove controls all come from the USWDS file-input JS — you only need the form-builder helper:

```erb
<%= f.file_field :proof_of_income,
                 label: "Upload documents",
                 hint: "PDF, JPG, or PNG. Maximum 10 MB per file.",
                 accept: ".pdf,.jpg,.jpeg,.png",
                 multiple: true %>
```

See ui-kit-components.md → "text_area, file_field".

**Features** (handled by USWDS + the form builder):
- Dashed-border drop zone, white background
- Link to trigger native file picker
- List of uploaded files with remove option
- Multiple-file support via `multiple: true`

---

### File Upload Requirements

**Pattern**: Clearly state accepted formats and size limits.

Pass MIME / extension allow-list via `accept:` and put size/format guidance in `hint:`:

```erb
<%= f.file_field :supporting_documents,
                 label: "Upload supporting documents",
                 hint: "Accepted formats: PDF, JPG, PNG. Maximum file size: 10 MB per file.",
                 accept: ".pdf,.jpg,.jpeg,.png",
                 multiple: true %>
```

Server-side size enforcement is your responsibility (Active Storage validators or a custom model validation).

---

## Navigation Patterns

### Back Button Behavior

**Pattern**: Back button goes to previous page without validation.

**Why**: Users should always be able to go back, even with incomplete data.

Use the shared form-buttons partial — the Back link points at the previous step and never triggers validation:

```erb
<%= render partial: "strata/shared/form_buttons", locals: {
  back_path: previous_step_path,
  f: f
} %>
```

See ui-kit-components.md → "Form Buttons (Back / Save and Continue)".

---

### Continue Button Behavior  

**Pattern**: "Save and continue" submits the form and runs the page's validations.

The same `strata/shared/form_buttons` partial renders the primary submit (it wraps `f.submit "Save and continue", big: true`). On submit:

- The page's validations (scoped via `on: <page_name>` on the model) run.
- If they pass, the framework advances to the next `question_page`.
- If they fail, the same page re-renders with inline errors auto-emitted by the builder.

**States**:
- Enabled by default — server-side validations gate progression
- Use Rails' `data: { disable_with: "Saving..." }` on `f.submit` (or the equivalent Turbo `data-turbo-submits-with`) if you need to block double-clicks during the round-trip

See ui-kit-components.md → "submit", "Form Buttons".

---

### Edit Links on Review Page

**Pattern**: Edit links jump directly to the page with that content.

```erb
<%= link_to "Edit", flow_step_path(:personal_info), class: "usa-link" %>
```

**Why**: Faster than clicking Back through every intermediate page.

---

## Dashboard Patterns

### Application Status

**Pattern**: Show status with color-coded badges.

**Status Types**:
- **In progress** (gray) - Draft saved, not submitted
- **Submitted** (gray) - Received, not reviewed
- **Under review** (gray) - Being processed
- **Approved** (green) - Accepted
- **Denied** (red) - Rejected
- **More information needed** (yellow) - Action required

The SDK's `Strata::ApplicationForm` ships with a `status` enum that covers `:in_progress` and `:submitted` (the two states a draft form moves through). Richer review states (`under_review`, `approved`, `denied`, `more_info_needed`) typically live on the case model that wraps the submitted form, not the form itself.

**Badge Colors** (USWDS tokens):
```css
.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 700;
  font-size: 0.93rem;
}

.status-approved {
  background: var(--usa-success-lighter);
  color: var(--usa-success-dark);
}

.status-pending {
  background: var(--usa-base-lightest);
  color: var(--usa-base-darker);
}
```

---

### Application List Layout

**Pattern**: Grid layout with key info visible.

```
┌────────────────────────────────────────────┐
│ Benefits Application    4/15/2026   Under  │
│ ID: BEN-2026-45123                  review │
│                          [View details]    │
├────────────────────────────────────────────┤
│ Benefits Application    3/22/2026  Approved│
│ ID: BEN-2026-38901                         │
│                          [View details]    │
└────────────────────────────────────────────┘
```

Build the list with `Strata::US::TableComponent` — it handles responsive stacking, striping, and accessibility:

```erb
<%= render Strata::US::TableComponent.new(
  borderless: true,
  striped: true,
  stacked: true,
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
      <% row.with_cell { link_to "View details", application_path(app), class: "usa-link" } %>
    <% end %>
  <% end %>
<% end %>
```

See ui-kit-components.md → "Strata::US::TableComponent".

---

## Accessibility Patterns

### Labels and Legends

**Pattern**: Every input must have an associated label.

The rendered output looks like:

```html
<!-- Text input -->
<label for="firstName">First name *</label>
<input id="firstName" type="text" />

<!-- Radio group -->
<fieldset>
  <legend>Marital status *</legend>
  <input type="radio" id="single" name="status" />
  <label for="single">Single</label>
</fieldset>
```

You don't write this markup by hand — `f.text_field`, `f.fieldset`, and `f.radio_button` emit it automatically, including matching `id` / `for` pairs and the required asterisk styling.

---

### Error Announcements

**Pattern**: Use `aria-describedby` to link errors to inputs.

Rendered output:

```html
<label for="email">Email *</label>
<span id="email-error" class="usa-error-message">
  Enter your email address
</span>
<input 
  id="email" 
  aria-describedby="email-error"
  aria-invalid="true"
/>
```

The Strata form builder sets `aria-describedby` (covering both `usa-hint` and `usa-error-message` spans) and `aria-invalid` automatically when the bound attribute has errors. See ui-kit-components.md → "Common options".

---

### Keyboard Navigation

**Pattern**: All interactive elements must be keyboard accessible.

**Requirements**:
- Tab moves focus forward
- Shift+Tab moves focus backward  
- Enter submits forms/activates buttons
- Space toggles checkboxes/radios
- Escape closes modals/dialogs

---

## Mobile Patterns

### Touch Targets

**Pattern**: Minimum 44×44px touch targets.

```css
.usa-button {
  min-height: 2.75rem; /* 44px */
  padding: 0.75rem 1rem;
}

input[type="radio"] {
  min-width: 1.25rem;
  min-height: 1.25rem;
}
```

---

### Mobile Form Layout

**Pattern**: Stack all inputs full-width on mobile.

USWDS responsive utility classes handle this — `width: :sm`/`:md` widths apply at `tablet:` (≥ 640px) and above; mobile is full-width by default.

```css
/* USWDS-generated, for reference */
input, select, textarea {
  width: 100%;
}

@media (min-width: 640px) {
  .usa-input--sm { max-width: 10rem; }
  .usa-input--md { max-width: 20rem; }
}
```

See ui-kit-components.md → "USWDS Design Tokens" and "Responsive Patterns".

---

## Content Patterns

### Plain Language

**Pattern**: Write at 8th grade reading level or below.

**Rules**:
- Use common words (not jargon)
- Short sentences (< 20 words)
- Active voice ("Enter your name" not "Your name should be entered")
- You/your (not "applicant" or "user")

**Examples**:
- ✅ "We need your address to mail you information"
- ❌ "Postal address is required for correspondence"

---

### Help Text

**Pattern**: Provide hints when the question might be confusing.

Use the `hint:` option that every form-builder field accepts:

```erb
<%= f.email_field :email,
                  label: "Email address",
                  hint: "We'll use this to send updates about your application" %>
```

Rendered output:

```
Email address *
We'll use this to send updates about your application
┌─────────────────────────────────┐
│                                 │
└─────────────────────────────────┘
```

**When to add hints**:
- Format requirements (dates, phone numbers)
- Why we're asking for this information
- Examples of valid answers
- Privacy/security reassurance

See ui-kit-components.md → "Common options".

---

## Performance Patterns

### Loading States

**Pattern**: Show loading state for async operations.

Rails + Turbo handles button-disable-on-submit out of the box. Pass `data: { disable_with: "..." }` (or `data: { turbo_submits_with: "..." }` on Turbo 8+) on `f.submit` to swap the label during the round-trip:

```erb
<%= f.submit "Submit application",
             big: true,
             data: { disable_with: "Submitting..." } %>
```

No client-side `isSubmitting` state to manage — the page transitions on the server response.

---

### Auto-Save

**Pattern**: Each completed page is persisted on submit.

The Strata SDK persists draft state via the normal `PATCH` round-trip from `strata_form_with`. Every "Save and continue" submission writes the page's fields to the `ApplicationForm` record; revisiting the flow restores the draft from that record (`status: :in_progress`).

If you genuinely need mid-page auto-save (e.g., a long text area on a single page), wire it up with a Stimulus controller — that's out of scope for the standard flow pattern.

See ui-kit-components.md → "SDK Fundamentals → Form entrypoint".

---

## Testing Patterns

In a Rails Strata project these checklists translate to RSpec request specs (page-level validation behavior) and system specs (end-to-end keyboard and a11y flow).

### Validation Testing

Test with:
- Empty required fields
- Invalid formats (email, phone, etc.)
- Out-of-range values
- Special characters
- Very long text

### Navigation Testing

Test:
- Back button from every page
- Continue button from every page
- Edit links from review page
- Save and exit from every page
- Direct URL access (deep linking)

### Accessibility Testing

Test with:
- Keyboard only (no mouse)
- Screen reader (NVDA, JAWS, VoiceOver)
- High contrast mode
- 200% zoom
- Mobile device

---

## Common Mistakes to Avoid

### ❌ Don't
- Ask for information you already have
- Use placeholder text as labels
- Make optional fields required
- Hide progress indicator
- Show errors before user interacts
- Use "Submit" for every page
- Reset form on validation errors
- Auto-advance on selection (radio, checkbox)

### ✅ Do
- Explain why you need information
- Use clear, persistent labels
- Mark required fields
- Show progress throughout
- Validate on Save and continue
- Use "Save and continue" for intermediate pages
- Preserve all entered data
- Let users review before submit

---

This pattern library should be used as a foundation for all multi-page application forms in the Strata SDK ecosystem.
