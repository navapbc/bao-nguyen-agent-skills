---
description: Provides engineering guidelines for building unemployment insurance benefit portals. Use when starting a new UI portal project, when making architectural decisions, or when the user asks about best practices for government benefits applications. Covers intake forms, accessibility, legacy integration, and production readiness.
---

# Unemployment Insurance Portal — Engineering Guidelines

These guidelines encode patterns from building government digital services including NJ DOL unemployment insurance modernization, the Strata SDK for government services, DOL ARPA modernization guidance, and cross-state unemployment insurance portal patterns. They apply regardless of tech stack.

For the unemployment intake form domain model (fields, types, validation, form structure), reference the [unemployment-intake-schema.json](../unemployment-intake-schema.json).

## Intake Forms

### State branding and configuration
- Create a `state-config` file on day one with all state-specific values in one place:
  - State name, abbreviation, department name, department abbreviation
  - Governor name (appears in official headers/footers)
  - Logo path, state seal path
  - Support phone number, support email
  - Agency website URL
  - Job search portal name and URL (varies by state — e.g., "Delaware VOCAL", "NJ Career Connections")
  - Program-specific values (e.g., weekly job search contact requirements)
- All components (header, footer, landing page, confirmation pages) read from this config — never hardcode state names or branding
- USWDS theme file (`_uswds-theme.scss`) should be customized with state brand colors from day one — this takes 5 minutes and makes prototypes feel real immediately
- This approach means switching states for a demo or deploying to a different state is a config change, not a code change

### Accessibility and design (DOL ARPA requirements)
- Use USWDS (U.S. Web Design System) components for all form controls
- Every form field needs: label, hint text, error message, and aria attributes
- Error messages must name the specific field — never say "this field is required"
- No periods at end of error messages, no "Please" — be direct
- Bilingual (en/es at minimum) from day one — use i18n keys, never hardcode English strings
- All interactive elements must be keyboard navigable
- Radio groups must be wrapped in fieldset + legend for screen reader context
- Mobile-first design — claimants must be able to file from mobile devices
- Top-of-page error banner listing all errors as bullet points, with auto-scroll and focus on submission failure
- Inline errors on each field in addition to the banner

### Plain language (DOL standard)
- Avoid jargon without definitions ("benefit year," "base period," "monetary determination")
- Present key information upfront: what the program is, basic eligibility, what to expect
- Action-oriented messaging: tell people what to DO, not just what went wrong
- Test comprehension with real users, especially non-English speakers
- Use the DOL UI Lexicon for standardized term definitions

### Validation
- Validate on the backend — single source of truth, no risk of frontend/backend divergence
- Return structured error responses (field path + i18n error key) so the frontend can display inline errors per field
- For multi-step forms, validate only the fields on the current page, not the entire form
- Distinguish "field is empty" (required) from "field has invalid value" (format/range error) — different error keys
- Each required error should name the field: "Employer name is required" not "This field is required"
- Frontend input constraints (numeric-only, max length, input masks) are UX conveniences, not validation — they prevent obviously wrong input but the backend is authoritative

### Multi-step form patterns
- Each page should be independently saveable — don't lose progress if the user leaves
- Provide a task list or progress indicator showing completed vs remaining sections
- Support conditional pages — don't show pages irrelevant based on prior answers
- Page flow definition should be declarative (list of pages with conditions), not imperative (scattered if/else)
- Pre-screening (screener) should come first — surface likely ineligibility early rather than after a full application

### Form field conventions for unemployment domains
- **Dollar amounts**: Integer input, whole dollars only, strip non-numeric, $ prefix and .00 suffix, max 4 digits ($9,999), hint "enter whole dollars only"
- **Hours**: Integer input, strip non-numeric, max 3 digits (999), hint "round up partial hours"
- **SSN/Tax ID**: Masked input, strip dashes on submit, validate 9 digits, never display full in UI
- **Dates**: Use the USWDS DatePicker component, not free text or separate month/day/year fields. The USWDS DatePicker provides a calendar popup, keyboard navigation, and consistent date formatting
- **Yes/No questions**: Radio buttons in fieldset with legend, not checkboxes. Conditional follow-ups appear inline below
- **Employer information**: Support multiple employers with add/remove. Fields: name, street address, city, state, zip (5 digits), phone (10 digits), hours, gross earnings, separation reason
- **Explanation text**: Character-counted textarea, "200 characters allowed" hint, show remaining count

### Button styling
- Primary action (Next, Submit): solid blue button (`usa-button`). Type="submit"
- Secondary action (Previous, Back): outline button (`usa-button--outline`) — white background with blue border and blue text. Never red — red implies destructive action
- Destructive action (Remove employer): unstyled link style (`usa-button--unstyled`), red text
- Submit button should show loading state ("Submitting...") and be disabled during API calls

### Page layout
- Use a sticky footer so the footer stays at the bottom of the viewport even on short pages. Apply `min-height: 100vh` on the page wrapper with flexbox: `display: flex; flex-direction: column` on the body/root, `flex: 1` on the main content area. This prevents the footer from floating up on pages with minimal content (like the education page with one field)
- Form content should be constrained to `desktop:grid-col-8` (two-thirds width) on desktop for readability
- Step indicator / progress bar sits above the form content at full width

### Data model
- Use the shared domain types defined in [unemployment-intake-schema.json](../unemployment-intake-schema.json): Name, Address, TaxId, MemorableDate, Money, Phone, YesNo
- The schema provides the standard field set across states — extend for state-specific requirements
- Structure form data to mirror the backend API model (nested objects, not flat field names) to avoid a mapping layer
- Immutability after submission — once submitted, the application form should not be modifiable
- Append-only audit trail for any status changes — record who, when, and why

## Legacy System Integration

### General principles
- Persist to your modern database FIRST, then write to legacy — never depend on legacy being available to complete a user request
- Feature flag every legacy integration independently so teams can test the modern flow without live legacy connections
- Wrap legacy calls (MQ, SOAP, mainframe) in durable execution (Temporal, Step Functions, or equivalent) — if the call fails, retry, don't lose the submission
- Never carry over cryptic field names from legacy systems — use descriptive names in your code and map at the boundary
- Document every legacy integration point: what data is sent, what format, what system, what the response means

### Dual-write pattern
- Modern DB is the primary write target, always
- Legacy writeback happens async (background job, workflow, queue)
- If legacy writeback fails, the user still sees success — reconciliation happens in background
- Log every legacy write attempt with request/response for debugging
- Plan for the legacy system to independently modify records — your sync process needs conflict handling

### Message queue / mainframe integration
- Fixed-width byte layouts are common for mainframe MQ — use a serialization library rather than manual string slicing
- MQ round trips to mainframes can take seconds — never block an HTTP request without a timeout
- Mock the MQ integration locally with realistic test data (wiremock or equivalent stubs)
- Document every MQ function code, queue name, and message layout — this knowledge is tribal and gets lost
- The mainframe response often contains enriched data (payment calculations, confirmation numbers, reason codes) — persist the full response, not just the fields you currently need

### Feature flags for integration layers
- Separate flags for each integration point: one for reads (eligibility lookup), one for writes (submission), one for legacy DB writes, one for email notifications
- Default new flags to OFF in production, ON in local dev (via mocks)
- When a flag is off, the rest of the flow should still work — return null/default for the gated portion
- This allows the team to test the full user experience without live legacy connections
- Example pattern from NJ: `enable_certification_event_validation` gates Temporal workflow, `enable_legacy_certification_integration` gates MQ submission, both independent

### Parallel system comparison
- When modernizing, run the new system in parallel with legacy to validate correctness
- Log outputs from both systems and surface discrepancies
- Identify expected mismatches (formatting differences) vs real errors (different eligibility decisions)
- Use feature flags to gradually shift traffic from legacy to modern

### Staff workflow integration
- Staff tools (adjudication, case review) often live in completely separate systems
- The staff system reads from the same data the claimant system writes to — understand this dependency
- If staff tools depend on a legacy database, your modern system may need to dual-write to that database
- Assignment/grab patterns need concurrent access protection — use DB transactions, not optimistic locking
- Track who grabbed what and when for workload reporting and audit

## Production Readiness

### Authentication and authorization
- Use middleware/proxy to check auth on every protected route — don't rely on individual page handlers
- Maintain a list of protected route patterns — new pages must be added explicitly
- Auth check should redirect to login with a callback URL, not show an error page
- If integrating with legacy auth (PIN, SSN-based), plan the migration path to modern auth (Cognito, OIDC)

### Observability
- Structured logging from day one — not System.out.println or console.log
- Track completion rate: how many start vs how many submit. Break down by drop-off point
- Track error rates by type: system errors vs user errors vs legacy integration failures
- If using analytics (GA), fire events at each stage with specific labels for each rejection/error reason
- Monitor legacy integration health: MQ response times, failure rates, timeout rates

### Error handling
- Top-of-page error banner with per-field bullet list, auto-scroll, auto-focus (accessibility)
- Each error names the specific field
- Backend returns structured validation errors (field path + error code), not string messages
- Distinguish validation errors (400) from system errors (500)
- Legacy integration failures should not show claimants a system error — degrade gracefully

### Testing
- Test each conditional path in the form
- Test validation: required fields empty, invalid values, boundary values (0, max)
- Mock external services in tests — never hit real legacy systems from CI
- Test feature flag permutations: flag on (full integration), flag off (graceful degradation)
- Test that legacy writeback failures don't break the user-facing flow

### Security
- Never hardcode credentials in source code
- Never display full SSN in UI — mask the first 5 digits
- Sanitize all user input before database queries
- Log access to PII fields for audit
- Foreign IP detection should be a flag/warning, not a silent block
