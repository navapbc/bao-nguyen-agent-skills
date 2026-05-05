# Application form UI reference

Generic UI/UX patterns for the **applicant-facing surface** of a Strata application form: the dashboard, the multi-page question flow, the review screen, and the confirmation screen. Distilled from a Claude Design handoff that mocked a passport application as a representative example. Use these patterns as a template for *any* Strata application form (passport, unemployment, benefits, licensing, etc.).

This file does NOT cover staff-facing UI — `strata:case` scaffolds those views under `/staff` and they have a separate visual language. See [`strata-sdk.md`](strata-sdk.md) §4 for the staff-vs-applicant split.

## 1. Source of truth

The design handoff is vendored in this repo at [`assets/application_forms/strata-passport-template/`](../../assets/application_forms/strata-passport-template/). Read these files when a section below cites a component or class — they are the authoritative source.

| File                                                                                                                       | What's in it                                                                                                            |
|----------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| [`Strata Application Form.html`](../../assets/application_forms/strata-passport-template/Strata%20Application%20Form.html) | Entry point — flow wiring, state shape, sample applications                                                             |
| [`Chrome.jsx`](../../assets/application_forms/strata-passport-template/Chrome.jsx)                                         | `Banner`, `Header` (with language toggle), `Footer`                                                                     |
| [`FormParts.jsx`](../../assets/application_forms/strata-passport-template/FormParts.jsx)                                   | `StepIndicator`, `FormActions`, `SaveModal`, `SaveExitButton`, `MemorableDate`, `NameFields`, `AddressFields`, `TextField`, `RadioTile` |
| [`Pages.jsx`](../../assets/application_forms/strata-passport-template/Pages.jsx)                                           | `Dashboard`, `IntroPage`, `NameDobPage`, `DobPage`, `PlaceOfBirthPage`, `AddressPage`, `ReviewPage`, `ConfirmationPage`  |
| [`app.css`](../../assets/application_forms/strata-passport-template/app.css)                                               | 148 selectors — `app-card`, `step-indicator`, `form-page`, `memorable-date`, `save-exit`, `modal`, etc.                 |
| [`uswds/colors_and_type.css`](../../assets/application_forms/strata-passport-template/uswds/colors_and_type.css)           | Design tokens                                                                                                           |

Provenance: originally exported from Claude Design at `https://api.anthropic.com/v1/design/h/vIDkcYdQSQgQ7N9tsxNVPg?open_file=Strata+Application+Form.html` on 2026-05-04. The local copy is the source of truth from here on.

- **Match visual output, not internal structure.** The prototype is a React + Babel sketch; in a Rails app, render the same DOM via ERB partials and the same classes.
- **Stack:** USWDS classes (`usa-banner`, `usa-button`, `usa-form-group`, `usa-input`, `usa-fieldset`, `usa-tag`, etc.) plus a small set of project-specific classes (`app-header`, `app-card`, `step-indicator`, `form-page`, `memorable-date`, `save-exit`, `modal`).

## 2. Page chrome

Every page (dashboard, every question page, review, confirmation) is wrapped in `<div class="app-shell">` containing, in order: **Banner → Header → main content → Footer**.

### 2a. USWDS .gov Banner

```html
<section class="usa-banner" aria-label="Official government website">
  <div class="usa-banner__inner">
    <img class="usa-banner__flag" src="<flag>" alt="" />
    <span class="usa-banner__text">An official website of the United States government</span>
    <button class="usa-banner__toggle" aria-expanded="false">Here's how you know <svg .../></button>
  </div>
  <!-- Expanded panel with two .usa-banner__detail blocks: ".gov" + "HTTPS" -->
</section>
```

### 2b. Header

- Brand link on the left (the agency name; treat as generic — "Agency Name").
- Primary nav: `Dashboard`, `My account`, `Log out`. `aria-current="page"` on the active link.
- **Language toggle** (right): button labeled `Español` when `lang === 'en'`, `English` otherwise. **Always visible**, even when content is English-only — the chat transcript made this an explicit requirement.

### 2c. Footer

Brand + four links (`About`, `Accessibility`, `Privacy`, `Contact`) + a single line of legal copy ("An official website of the United States government.").

## 3. Applicant dashboard

The dashboard is the entry point after sign-in. It groups the user's applications by status and provides the "start a new application" affordance.

### 3a. Layout

- Hero section (`.dashboard-hero`) with `<h1>Your applications</h1>` and a primary "Start a new application" button.
- Below: one section per non-empty status group, in this order: **Action needed → In progress → Under review → Submitted → Past applications**. Sections with zero items are omitted.
- Each section: `<h2>` heading + `<ul>` of `.app-card` list items.

### 3b. Card anatomy

```
[ usa-tag (status) ]
  Application title (e.g. "Passport application")
  Meta line  ←  varies by status, see §4
  [ optional: progress bar OR action detail in red ]
                                                           [ Primary CTA ]
```

CTA rules:
- `in_progress`, `action_needed` → **filled** `usa-button` (primary).
- everything else (`in_review`, `submitted`, `approved`, `denied`) → **outline** `usa-button usa-button--outline` (secondary; "View").

Progress bar (only when `in_progress`): `.app-card__progress > .app-card__progress-bar > .app-card__progress-fill[style="width: N%"]`, with adjacent `<span>{N}% complete</span>`.

## 4. Status taxonomy

These six statuses are the canonical set. New programs should reuse them; only add a new status if the lifecycle genuinely differs.

| Internal status | USWDS tag class           | Tag label         | Meta line shape                                                | Primary CTA       |
|-----------------|---------------------------|-------------------|----------------------------------------------------------------|-------------------|
| `in_progress`   | `usa-tag--in-progress`    | In progress       | `Started <date> · Application #<id>`                           | Continue (filled) |
| `action_needed` | `usa-tag--action-needed`  | Action needed     | `Response needed by <date> · Application #<id>` + red detail   | Provide response  |
| `in_review`     | `usa-tag--in-review`      | Under review      | `Submitted <date> · Confirmation #<conf>`                      | View (outline)    |
| `submitted`     | `usa-tag--submitted`      | Submitted         | `Submitted <date> · Confirmation #<conf>`                      | View (outline)    |
| `approved`      | `usa-tag--approved`       | Approved          | `Submitted <date> · Confirmation #<conf>`                      | View (outline)    |
| `denied`        | `usa-tag--denied`         | Decision issued   | `Submitted <date> · Confirmation #<conf>`                      | View (outline)    |

Note: the SDK base model `Strata::ApplicationForm` ships `status:integer` (see [`strata-sdk.md`](strata-sdk.md) §3). Map your enum keys to the labels above when rendering. The action-needed sub-status (red detail copy) lives outside `status` — it's whatever instruction the program issues to the applicant.

## 5. Multi-page question flow

A flow is an ordered list of routes. Canonical shape:

```
intro → <question pages…> → review → confirmation
```

The intro screen counts as step 1 in the indicator. The review page is the last *form* step; the confirmation page sits outside the indicator.

### 5a. FormPageShell

Every form page (intro, every question, review) renders inside the same shell:

```jsx
<main class="app-main">
  <div class="app-container app-container--narrow form-page">
    <SaveExitButton onSave={…} />        {/* §7c */}
    <StepIndicator current={N} total={FLOW_TOTAL} label={…} />  {/* §6 */}
    {…page content…}
  </div>
</main>
```

`app-container--narrow` constrains the content column. The `Save and exit` button and the step indicator render *above* the page heading, in that order.

### 5b. One-question-per-page vs. grouped

Both layouts are valid. Pick one per program based on the attribute count and complexity:

- **One-per-page** (default): `name → dob → place-of-birth → address → review`. Lower cognitive load; longer flow.
- **Grouped** (when fields are tightly related): `name+dob → place-of-birth → address → review`. Shorter flow; only group fields that conceptually belong together (a name + DOB pair is the canonical example).

The flow length feeds `total` in the step indicator. Pick at plan time and don't change it mid-build — switching mid-flow invalidates the user's mental "N of N" model.

### 5c. Page heading + lede + content + actions

```html
<h1>{{question}}</h1>
<p class="form-page__lede">{{plain-language explanation}}</p>
{{form fields}}
<div class="form-actions">…back+continue…</div>
```

`form-page__lede` is the "what we're asking and why" copy. Keep it short (1–2 sentences). For optional fields, add a `.form-page__hint` line.

## 6. Step indicator

Segmented bar on top of a "{N} of {N}: {label}" counter. Use `role="progressbar"` with `aria-valuenow/min/max`.

```jsx
<div class="step-indicator" aria-label={`Step ${current} of ${total}`}>
  <div class="step-indicator__bar" role="progressbar"
       aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
    {Array.from({ length: total }).map((_, i) => (
      <div class={
        'step-indicator__seg' +
        (i + 1 < current  ? ' step-indicator__seg--complete' :
         i + 1 === current ? ' step-indicator__seg--current'  : '')
      } />
    ))}
  </div>
  <div class="step-indicator__heading">
    <span class="step-indicator__counter">{current}</span>
    <span class="step-indicator__of">of {total}</span>
    <span class="step-indicator__label">{label}</span>
  </div>
</div>
```

## 7. Form primitives

The prototype defines a small set of reusable inputs. Re-implement them as Rails partials (or a single form helper module); the names below are the canonical mental model.

### 7a. `TextField`

`label + (optional) hint + usa-input` inside `.usa-form-group`. Supports `autoComplete`, `inputMode`, and a width modifier (`usa-input--small`, `usa-input--medium`, `usa-input--xs`).

### 7b. `MemorableDate` (date of birth)

USWDS-style three-field date picker: separate `Month`, `Day`, `Year` inputs with `inputMode="numeric"` and `maxLength` 2/2/4. Wrapped in `<fieldset class="usa-fieldset">` with a legend, optional hint, and inline `usa-error-message`.

```html
<fieldset class="usa-fieldset">
  <legend class="usa-legend">Date of birth</legend>
  <span class="usa-hint">For example, 04 28 1986</span>
  <div class="memorable-date">
    <div class="memorable-date__group">
      <label for="dob-month">Month</label>
      <input id="dob-month" inputmode="numeric" maxlength="2" placeholder="MM" class="usa-input usa-input--xs" />
    </div>
    <!-- Day, Year identical pattern -->
  </div>
</fieldset>
```

### 7c. `SaveExitButton` and `SaveModal`

A small "Save and exit" link with a save icon, rendered above the step indicator on every form page. Clicking it opens a confirmation modal:

```html
<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="save-title">
  <div class="modal">
    <h2 id="save-title">Your progress is saved</h2>
    <p>You can return to this application from your dashboard at any time. We'll save your answers as you go.</p>
    <ul class="usa-button-group">
      <li><button class="usa-button">Return to dashboard</button></li>
      <li><button class="usa-button usa-button--outline">Keep going</button></li>
    </ul>
  </div>
</div>
```

The chat transcript pinned this as a non-negotiable: **the affordance must appear on every form page**, not just the first.

### 7d. `NameFields`

Four inputs: `first` (required, `autocomplete="given-name"`), `middle` (optional, hint "Optional"), `last` (required), `suffix` (optional, hint "For example, Jr., Sr., II", narrow width).

### 7e. `AddressFields`

`line1` (required) + `line2` (optional, hint "Apartment, suite, unit, etc.") + `city` + state `<select>` (use a US-states constant) + `zip` (numeric, medium width). Standard `autocomplete` tokens (`address-line1`, `address-level2`, `postal-code`).

### 7f. `RadioTile`

Card-style radio: clickable label with the radio input, used for picking between a small number of mutually-exclusive options (e.g., Place of Birth: "United States" vs. "Another country").

### 7g. `FormActions`

```html
<div class="form-actions">
  <button class="usa-button usa-button--outline btn-back">Back</button>   <!-- omit on first step -->
  <button class="usa-button">Continue</button>
</div>
```

`Back` may be omitted on the intro page. `Continue` accepts a `disabled` / `aria-disabled` prop for invalid states.

## 8. Review page

Rendered as the last step of the flow. Lists every section the user filled, grouped by topic (not by individual page), each with an **Edit** link that jumps back to the relevant form route.

Structure per section:

```
<h2>Section title</h2>            (e.g. "Place of birth")
<a class="review-edit">Edit</a>   (jumps to the form route for that section)
<dl>
  <dt>Field label</dt><dd>Value</dd>
  ...
</dl>
```

Submit affordance lives at the bottom: a single primary `Submit application` button (no Back button is needed if Save & Exit is available, but keep Back for symmetry with other pages).

The "grouped summary with per-section Edit link" pattern is straight from USWDS guidance — the chat transcript explicitly asked for it.

## 9. Confirmation page

Renders after submit. NO step indicator (the flow is done).

- Heading: "Your application has been submitted"
- Personalized greeting using the applicant's first name
- Confirmation number prominently displayed (format `P-XXXXXX-YYYY` is the prototype's convention; pick a program-appropriate prefix, but keep human-readable + uppercase)
- Submitted-at date
- A "What happens next" subsection with 1–3 bullets describing program-specific next steps
- Primary CTA: "Return to dashboard"

## 10. Cross-cutting concerns

- **Save and exit** — visible on every form page (§7c). The Rails app should persist on every transition, not only on click; the modal just confirms exit.
- **Persistence model** — the prototype uses `localStorage` keyed by app id. In Rails, persist via the application form record itself: `status: in_progress`, partial attribute updates allowed, `submitted_at: nil` until the final submit. See [`strata-sdk.md`](strata-sdk.md) §3 for the base attributes.
- **Language toggle** — the toggle button must always render (see §2b). Translating content is a separate concern; English-only at launch is acceptable.
- **Mobile** — the layout is single-column at all widths; the prototype includes a `mobile-preview` body class that the Rails app does not need (responsive CSS handles it).
- **Authorization** — every applicant route must be Pundit-scoped (see [`strata-sdk.md`](strata-sdk.md) §6). The UI treats authorization failures (e.g. attempting to edit a submitted form) by routing to a read-only review action, not by 403 page.

## 11. What this reference is NOT

- Not a copy-paste ERB template. Re-implement the patterns in idiomatic Rails partials.
- Not staff/admin UI. `strata:case` scaffolds those at `/staff` with a different layout.
- Not a routing spec. Pick route names that fit the Rails app conventions; the *flow shape* (§5) is what matters.
- Not authoritative on the SDK domain model. When the SDK's behavior conflicts with this file, the SDK wins — re-read [`strata-sdk.md`](strata-sdk.md) and update this file.
