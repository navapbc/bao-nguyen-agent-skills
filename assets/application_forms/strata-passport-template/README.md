# Strata passport application — design template

Local copy of a Claude Design handoff for a generic, multi-page Strata application form (passport used as the worked example). Vendored here so the reference at [`/references/application-form-ui.md`](../../../references/application-form-ui.md) has stable, in-repo paths to cite.

**Origin**: `https://api.anthropic.com/v1/design/h/vIDkcYdQSQgQ7N9tsxNVPg?open_file=Strata+Application+Form.html` (Claude Design export, 2026-05-04).

## Where to look

1. [`/references/application-form-ui.md`](../../../references/application-form-ui.md) — the curated guide. Read this first; it's the entry point for any agent building an applicant-facing Strata form.
2. `Strata Application Form.html` — entry point. Shows flow wiring (intro → questions → review → confirmation), state shape, and sample data.
3. `Chrome.jsx` — Banner, Header (with language toggle), Footer.
4. `FormParts.jsx` — reusable primitives: `StepIndicator`, `FormActions`, `SaveModal`, `MemorableDate`, `NameFields`, `AddressFields`, `TextField`, `RadioTile`, `SaveExitButton`.
5. `Pages.jsx` — page-level components: `Dashboard`, `IntroPage`, `NameDobPage`, `DobPage`, `PlaceOfBirthPage`, `AddressPage`, `ReviewPage`, `ConfirmationPage`.
6. `app.css` — 148 selectors (USWDS-derived + project-specific classes).
7. `uswds/colors_and_type.css` — design tokens. `uswds/assets/` holds the flag and `.gov` / HTTPS lockup icons used by the Banner.

## What is intentionally NOT vendored

- USWDS fonts (`*.woff2`) — production Rails apps get them from the USWDS gem; bundling them here would only add weight.
- The design tool's `tweaks-panel.jsx` — a dev-only runtime panel, not part of the form itself.
- Screenshot exports (`uploads/*.png`) — the handoff README is explicit: don't render or screenshot. Read the source.

## Stack note

The HTML uses React + Babel served via UMD scripts. That's a prototype runtime, not the implementation target. Rails apps should re-implement the same DOM + USWDS classes via ERB partials.
