---
description: Generates an unemployment insurance intake form (initial claim application). Use when building a new unemployment portal, prototyping a claim intake flow, or adding an intake form to an existing application. Generates code in the user's tech stack with proper USWDS components, validation, i18n, accessibility, and the standard unemployment domain model.
arguments: [tech-stack]
---

# Generate Unemployment Insurance Intake Form

Generate a complete unemployment insurance initial claim intake form based on the shared domain schema and portal guidelines.

## Before generating

1. Read the domain schema: [unemployment-intake-schema.json](unemployment-intake-schema.json)
2. Read the engineering guidelines: [../unemployment-portal-guidelines/SKILL.md](../unemployment-portal-guidelines/SKILL.md)
3. Ask the user for their tech stack if not provided via `$tech-stack`. Common options:
   - **Next.js + React** — React Hook Form + Zod validation, USWDS React components (@trussworks/react-uswds), next-intl for i18n
   - **Rails** — USWDS form builder, ERB templates, ActiveRecord validations
   - **Python + Flask/Django** — Pydantic/WTForms, Jinja templates
   - **Other** — Ask for specifics on form library, component library, validation approach, i18n

## What to generate

### 1. Data model / validation schema

Generate from `domain_types` and `form_sections` in the schema:

- **For Next.js/React**: TypeScript interfaces for form data shape, structured as nested objects mirroring the form sections. No client-side validation library (no Zod) — all validation comes from the backend API. The frontend submits each page to the backend, receives structured error responses (field path + error key), and displays them inline. This keeps validation logic in one place (Pydantic on the backend) with no risk of frontend/backend divergence.
- **For Rails**: ActiveRecord model with `strata_attribute` declarations (if using Strata SDK) or standard column definitions. Per-page validation contexts.
- **For Python**: Pydantic models with Optional fields for conditional sections.

Key validation patterns (implemented on the backend, errors returned to frontend):
- Required fields: error key names the field (e.g., `employer_name_required` -> "Employer name is required")
- Conditional required: validate at the model level (e.g., `authorized_to_work` required only when `us_citizen` is false)
- SSN: exactly 9 digits after stripping dashes
- ZIP: exactly 5 digits
- Phone: exactly 10 digits
- Money: must be > 0 when provided
- Dates: valid calendar date
- Return errors as structured JSON: `[{ "field": "path.to.field", "error": "i18n_error_key" }]` so the frontend can map them to inline field errors and translate them

### 2. Form pages

Generate one page/component per `pages` entry in the schema. Each page includes:

- Page title and any hint text
- All fields for that page using the appropriate USWDS component:
  - `yes_no` type -> Radio group in fieldset with legend
  - `name` type -> First/middle/last/suffix field group
  - `address` type -> Street/city/state/zip field group with state dropdown. State in question should be first in list.
  - `tax_id` type -> Masked SSN input
  - `memorable_date` type -> USWDS DatePicker component (not separate month/day/year fields)
  - `money` type -> Dollar input with $ prefix, .00 suffix, numeric-only
  - `phone` type -> Phone input, 10 digits
  - `string` with `enum` -> Select dropdown or radio group
  - `string` without enum -> Text input with max_length
  - `boolean` with `must_be_true` -> Required checkbox
- Conditional show/hide for fields with `show_when`
- Per-page validation on submit
- Navigation: next/previous buttons. Next is primary (solid blue, type="submit"). Previous is outline variant (`usa-button--outline` — white with blue border and blue text, not red). Previous is hidden on the first page

For repeatable sections (employers):
- Dynamic add/remove with field array pattern
- Each employer in a bordered card/box with a heading ("Employer 1", "Employer 2")
- Vertical field layout within each employer card
- "Add another employer" button, max from schema
- "Remove this employer" button (unstyled, red text)

### 3. Review page

- Read-only summary of all sections
- Edit link per section that navigates back to that page
- Certification checkbox at the bottom (must be checked to submit)

### 4. Error handling

- Top-of-page error banner on submission failure listing all errors (with specificity) as bullet points
- Auto-scroll and focus the banner (accessibility)
- Each bullet names the specific field
- Inline errors on each field in addition to the banner
- No periods at end of error messages, no "Please"

### 5. i18n

Generate translation files for English and Spanish (at minimum):
- Every label, hint, error message, page title as an i18n key
- Never hardcode English strings in components
- Use plain language per DOL guidance
- Structure: `intake.{section}.{page}.{field_name}` for labels, `intake.validation.{error_key}` for errors

### 6. Progress indicator

- Task list or step indicator showing all sections
- Current section highlighted
- Completed sections marked with checkmark
- Sections not yet visited shown as incomplete

## Backend API and persistence

Generate a working backend alongside the frontend. The backend should:

### API endpoints
- **POST /application** — Create a new application (returns application_id)
- **PUT /application/{id}/section/{section_id}** — Save one section at a time (enables page-by-page save). Validates only the fields for that section, returns structured errors
- **GET /application/{id}** — Retrieve full application (for review page and resume-in-progress)
- **POST /application/{id}/submit** — Final submission. Validates all sections, marks as submitted (immutable after this)

### Data model
- Application table with status (in_progress, submitted), claimant reference, timestamps
- Store form data as structured JSON or normalized tables depending on the stack:
  - **Python/Pydantic**: Pydantic models for each section, stored as JSONB in Postgres
  - **Rails/Strata**: `strata_attribute` declarations with column-per-field via migrations
- Employer records as a nested array within the employment section

### Legacy integration interfaces
- Define abstract interfaces/base classes for each integration point, with mock implementations that return realistic data:
  - **Eligibility check** — interface for checking claimant eligibility against an external system. Mock returns eligible with sample benefit amounts
  - **Wage lookup** — interface for retrieving wage history. Mock returns sample quarterly wages
  - **Submission writeback** — interface for writing the submitted application to a legacy system. Mock logs the payload and returns a confirmation number
  - **Identity verification** — interface for verifying claimant identity. Mock returns verified
- Each interface should have a feature flag controlling whether the real or mock implementation is used
- This pattern lets teams build and test the full flow, then swap in real integrations one at a time

### Documentation

Generate two docs:

**README.md** — Short and practical. Engineers should be able to clone and run in under 5 minutes. Include:
- One-line project description
- Prerequisites (Node version, Python version, Docker, etc.)
- Getting started commands (`npm install`, `make setup`, `make dev`, etc.)
- How to run tests
- How to run linting
- Project structure overview (where frontend lives, where backend lives, where config lives)

**docs/path-to-production.md** — What's included, what's not, and what's needed to go live. Include:
- What the prototype covers (intake form, backend API, mock integrations, persistence)
- What's NOT included and needs to be added:
  - **Authentication**: Recommend options (Cognito, Auth0, Login.gov) and where to add it (middleware for frontend, API auth layer for backend)
  - **Deployment**: Recommend containerized deployment (Docker), note cloud options (AWS ECS/Fargate, GovCloud), mention infrastructure-as-code (Terraform)
  - **Legacy integrations**: List each stubbed interface, what it would connect to in production, and what access/information is needed from the state
  - **Identity verification**: ID.me, Login.gov, or state-specific identity proofing
  - **Email notifications**: Confirmation emails, status updates — recommend SES or equivalent
  - **Monitoring/observability**: Structured logging, error tracking, APM
  - **Security review**: OWASP top 10, penetration testing, ATO process
- Each item should be a short paragraph, not a full spec — enough to scope the work

### What NOT to generate
- Authentication/authorization (depends on identity provider)
- Deployment/infrastructure configuration
- Real legacy integration implementations (only the interfaces and mocks)

## Tech stack specific patterns

### Next.js + React

- **App Router**: Use Next.js App Router (not Pages Router). Server Components for data fetching, Server Actions for form submission
- **Data fetching**: Server Components fetch data at the page level — no client-side fetching library needed. No TanStack Query. Data is passed to client components as props
- **Form submission**: Server Actions for mutations. The action validates via the backend API, returns structured errors `{ field: "employer_name", error: "employer_name_required" }`, and the client displays them. Use `useActionState` for pending/error states and `useFormStatus` for submit button loading state
- **Form state**: React Hook Form for complex multi-field forms (employer arrays, conditional fields). For simpler pages, native form elements with Server Actions may suffice
- **Validation**: All validation on the backend (Pydantic). Single source of truth, no divergence risk. Frontend input constraints (numeric-only, max length) are UX conveniences, not validation
- **Components**: @trussworks/react-uswds wrapped in reusable components (only if needed):
  - `YesNoQuestion` — fieldset + legend + radios + error display
  - `DollarInput` — $ prefix, .00 suffix, numeric-only filter
  - `HoursInput` — numeric-only filter, max 3 digits
  - `DatePicker` — USWDS DatePicker component (calendar popup, keyboard nav, MM/DD/YYYY format)
  - `CharCountTextarea` — character counter, limit hint
  - `CheckboxField` — for certification checkbox
- **Button styling**: Primary actions use `usa-button` (solid blue). Secondary actions (Previous/Back) use `usa-button--outline` (white with blue border). Never use red for navigation — red is only for destructive actions (remove employer)
- **Layout**: Sticky footer via flexbox (`min-height: 100vh` on root, `flex: 1` on main). Form content constrained to `desktop:grid-col-8`
- **i18n**: next-intl with `useTranslations` hook, strict key typing
- **Error display**: Backend returns i18n error keys (e.g., `employer_name_required`). Frontend translates and displays them inline per field and in the top-of-page error banner
- **Routing**: App Router file-based routing, one folder per form page. Layouts for shared UI (progress indicator, form chrome)
- **Auth**: Middleware (`middleware.ts`) checks auth on protected routes before page renders
- **Caching**: Use `revalidatePath` / `revalidateTag` for cache invalidation after mutations, not a client-side cache library

### Rails (with Strata SDK)

Use the [Strata SDK](https://github.com/navapbc/strata-sdk-rails) — a Rails engine built by Nava PBC specifically for government benefit portals. It provides:

- **Form builder**: `Strata::FormBuilder` with USWDS-compliant helpers (`f.name`, `f.address_fields`, `f.yes_no`, `f.money_field`, `f.memorable_date`, `f.tax_id_field`). Invoked via `strata_form_with` in views
- **Data model**: `strata_attribute` declarations for domain types (`:name`, `:address`, `:money`, `:tax_id`, `:memorable_date`) — one line per attribute generates columns, value objects, and form integration
- **Multi-page flow**: `Strata::Flows::ApplicationFormFlow` DSL defines tasks and question pages. Auto-generates controller actions (edit/update per page), per-page validation contexts, and navigation helpers
- **Application form base class**: `Strata::ApplicationForm` provides status tracking (in_progress -> submitted), immutability after submit, and event publishing
- **Generators**: `rails generate strata:application_form`, `strata:migration`, etc. for scaffolding

### Python (API layer)

Python is typically used as the backend API, not the frontend. The frontend is a separate app (Next.js, React, etc.) that calls the Python API. Based on patterns from NJ DOL claimant-api:

- **API framework**: Flask/APIFlask with route handlers
- **Validation + serialization**: Pydantic models for request validation, response serialization, and DB mapping (e.g., `ApplicationRequest` with nested models per form section)
- **ORM**: SQLAlchemy models for Postgres persistence
- **Workflows**: Temporal for durable execution of multi-step processes (submission -> eligibility check -> legacy writeback). Can be added later — not required for initial prototype
- **Legacy integration**: Abstract base class (e.g., `LegacyIntegrationService`) with methods like `check_eligibility()`, `lookup_wages()`, `submit_application()`. Mock implementation returns realistic test data. Feature flag (`USE_MOCK_LEGACY_CLIENT`) switches between mock and real. Actual implementation added later when legacy access is available
