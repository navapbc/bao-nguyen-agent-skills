# Model spec file — format

The model spec is the single shared artifact for the build-strata-sdk-model pipeline. The orchestrator creates it, every agent reads it, and the orchestrator writes it around the two checkpoints. It is **temporary**: on Checkpoint-2 confirmation the implementation agent converts it into the committed plan, then deletes it.

**Location:** `<RAILS_DIR>/tmp/strata-model-spec-<model-kebab>.md` (Rails gitignores `tmp/`).

**Lifecycle status** (frontmatter `status`): `draft → suggested → audited → resolved → confirmed`.

## Structure

```markdown
---
model_name: FreeSchoolLunchApplicationForm
model_kind: application_form        # plain | application_form | case | business_process | task
app_type: free-school-lunch           # only for application_form
purpose: "One sentence from the user."
rails_dir: apps/benefits
status: draft
---

## SDK facts            # written by the discovery agent (Run 1)
- sdk_present: true
- gem_path: /path/to/strata
- generator: `bin/rails generate strata:application_form FreeSchoolLunch <attrs>` (flags verified)
- base_class: Strata::ApplicationForm
- base_attributes (do NOT propose): user_id:uuid, status:integer, submitted_at:datetime
- type_catalog: name, address, tax_id, memorable_date, money, ssn, year_quarter, ...
- base_class_summary: status enum in_progress/submitted; submit_application flow; events ...

## Attributes          # the evolving heart of the spec
| name | type | source | status | note |
|------|------|--------|--------|------|
| name | name | user | accepted | |
| household_size | integer | suggested | accepted | needs-eligibility |
| annual_income | money | audited | resolved | was string, fixed |

# source:  user | suggested | base
# status:  proposed | accepted | rejected | flagged | resolved

## Audit flags          # written from the audit agent (Run 3 stage 1)
- annual_income: declared `string`, should be `money` (severity: high)

## Resolution changelog # written from the resolution agent (Run 3 stage 2)
- annual_income → money. Flag CONFIRMED.
- household_size flag REJECTED as false positive: integer is correct for a count.
```

## Rules

- The **Attributes table is the contract.** Every agent reads and extends it; `source` and `status` make each attribute auditable across the pipeline.
- Agents return structured data; the **orchestrator owns writes** to the spec around checkpoint boundaries (no concurrent writers).
- **Validations and lifecycle are NOT stored here.** The implementation agent derives default validations and variant lifecycle facts when it writes the committed plan.
- Base attributes provided by the SDK base class are never listed as `source: user`/`suggested`; they belong only in `## SDK facts` under `base_attributes`.
