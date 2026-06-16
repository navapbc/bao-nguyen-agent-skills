# Build Strata SDK Model — Agentic Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the `build-strata-sdk-model` skill from a 494-line single-agent linear workflow into a segmented multi-agent pipeline orchestrated through the `Workflow` tool, with a shared temp model-spec file and two human checkpoints.

**Architecture:** `SKILL.md` becomes a lean orchestrator. It runs four sequential `Workflow` runs (discovery → suggest → audit/resolve → implement/review), pausing at two checkpoints to collect user input. Each run dispatches subagents that read a self-contained reference file plus the shared temp spec and return structured data (first four agents) or a prose report (last two). Agent logic lives in `references/agents/*.md`; orchestration scripts live in `references/workflows/*.js`.

**Tech Stack:** Markdown skill files, JavaScript `Workflow` scripts (plain JS run by the Workflow runtime), Python linter (`scripts/lint_skills.py`). The skill targets Rails apps using the `strata` gem; this plan edits only the *skills repo*, not any Rails app.

---

## Source of truth

This plan ports content from the **current** `skills/build-strata-sdk-model/SKILL.md` (494 lines). Line references below point into that current file. Keep it open while implementing. The approved design spec is `docs/superpowers/specs/2026-06-16-build-strata-sdk-model-agentic-refactor-design.md`.

## File structure

```
skills/build-strata-sdk-model/
├── SKILL.md                                 ← Task 12: rewritten orchestrator (<500 lines)
├── references/
│   ├── model-spec-schema.md                 ← Task 1  (new)
│   ├── agents/
│   │   ├── discovery.md                      ← Task 2  (new; ports current steps 1–3 + ruby check)
│   │   ├── suggestion.md                      ← Task 3  (new; ports current step 4d)
│   │   ├── attribute-audit.md                 ← Task 4  (new)
│   │   ├── resolution.md                      ← Task 5  (new)
│   │   ├── implementation.md                  ← Task 6  (new; ports current steps 5–9)
│   │   └── review.md                          ← Task 7  (new)
│   ├── workflows/
│   │   ├── run-1-discovery.js                 ← Task 8  (new)
│   │   ├── run-2-suggest.js                   ← Task 9  (new)
│   │   ├── run-3-audit-resolve.js             ← Task 10 (new)
│   │   └── run-4-implement-review.js          ← Task 11 (new)
│   ├── test-driven-development.md            ← KEPT (symlink, unchanged)
│   ├── writing-plans.md                      ← KEPT (symlink, unchanged)
│   ├── ruby-version-check.md                 ← KEPT (symlink, unchanged)
│   └── verification.md                       ← Task 12: REMOVED (symlink deleted)
```

## Verification surface (read before starting)

This repo has no test harness for markdown prose or for `Workflow` scripts (those run only inside the live Workflow runtime against a real Rails app — validated by the manual E2E run in the spec's Testing section). So tasks verify against what *is* checkable here:

- **`SKILL.md`** — `python scripts/lint_skills.py` (frontmatter, name-matches-dir, description ≤ 250 chars & no first/second person, body ≤ 500 lines).
- **Reference markdown** — file exists and contains its required section headings (grep assertions per task).
- **Workflow `.js` scripts** — structural sanity: starts with `export const meta`, `meta` has `name` + `description`, declares `phases`, contains no forbidden runtime APIs (`Date.now`, `Math.random`, argless `new Date()`). These scripts are **not** standalone-valid ESM (they use both top-level `export` and top-level `return`, which the Workflow runtime wraps), so `node --check` does **not** apply — use the grep assertions.

A reusable sanity-check for a workflow script (used in Tasks 8–11):

```bash
check_wf () {
  f="$1"
  head -1 "$f" | grep -q '^export const meta' && echo "OK: starts with meta" || echo "FAIL: meta must be first line"
  grep -q "name:" "$f" && grep -q "description:" "$f" && echo "OK: meta has name+description" || echo "FAIL: meta missing name/description"
  grep -q "phases:" "$f" && echo "OK: phases present" || echo "FAIL: phases missing"
  grep -nE 'Date\.now|Math\.random|new Date\(\)' "$f" && echo "FAIL: forbidden runtime API found" || echo "OK: no forbidden APIs"
}
```

All commits run from the skills repo root (`/Users/baonguyen/Documents/NavaGithub/bao-nguyen-agent-skills`) on branch `baonguyen/refactor-strata-sdk-model-workflow` (already created and holding the spec commit).

---

### Task 1: `model-spec-schema.md` — the shared temp-spec contract

**Files:**
- Create: `skills/build-strata-sdk-model/references/model-spec-schema.md`

This is the artifact every agent reads/writes; build it first so later references can cite it.

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/model-spec-schema.md` with exactly this content:

````markdown
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
````

- [ ] **Step 2: Verify the file exists with its key sections**

Run:
```bash
test -f skills/build-strata-sdk-model/references/model-spec-schema.md && \
grep -q "## Structure" skills/build-strata-sdk-model/references/model-spec-schema.md && \
grep -q "Attributes table is the contract" skills/build-strata-sdk-model/references/model-spec-schema.md && \
echo PASS || echo FAIL
```
Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/model-spec-schema.md
git commit -m "$(cat <<'EOF'
Add model-spec-schema reference for sdk-model pipeline

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `agents/discovery.md` — discovery agent instructions

**Files:**
- Create: `skills/build-strata-sdk-model/references/agents/discovery.md`
- Port from: current `SKILL.md` lines 27–142 (Steps 1–3) and the existing `references/ruby-version-check.md`.

The discovery agent runs inside Run 1, locates the Rails app, verifies Ruby, detects + reads the SDK, and returns the `SDK_FACTS_SCHEMA` object (defined in Task 8). It is the only agent allowed to read the gem source.

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/agents/discovery.md` as agent-directed instructions (the reader is a subagent). It MUST contain these sections, with content ported and re-framed:

1. **`# Discovery agent`** — one-paragraph role: "You are dispatched to discover the environment and the Strata SDK. You never ask the user anything and you never write files. You return a single structured `SDK facts` object."
2. **`## 1. Locate the Rails app`** — port the monorepo-aware search from current `SKILL.md` lines 31–58 (the `Gemfile` + `bin/rails` checks, the depth-≤3 `find`). Re-frame the "ask the user" branches (lines 49–56): the agent does **not** ask; instead, if there are zero matches it returns `rails_dir: ""` with a `notes` explanation; if exactly one, use it; if multiple, pick the shallowest path and record the alternatives in `notes`.
3. **`## 2. Verify Ruby`** — instruct the agent to follow `ruby-version-check.md` (sibling file: `../ruby-version-check.md`) and set `ruby_ok` accordingly; record the detected vs required version in `notes` if mismatched.
4. **`## 3. Detect the SDK`** — port current lines 64–86: run `bundle show strata`; set `sdk_present` + `gem_path`.
5. **`## 4. Read the SDK`** — port current lines 90–142: inventory generators, read each `*_generator.rb` as authoritative (USAGE may be stale — call out the hyphenated `--application-form` example), read the base classes, skim docs, capture the attribute `type_catalog`. Stress: trust the gem over any memory.
6. **`## 5. Return`** — instruct: return the `SDK facts` object matching the schema the workflow passed you. For each of `application_form`, `case`, `business_process`, `task` that exists, populate `variants.<kind>` with `generator_cmd`, `verified_flags`, `produces`, `base_class_summary`, `base_attrs`. If `sdk_present` is false, return only `rails_dir`, `ruby_ok`, `sdk_present: false`.

- [ ] **Step 2: Verify**

Run:
```bash
test -f skills/build-strata-sdk-model/references/agents/discovery.md && \
grep -q "# Discovery agent" skills/build-strata-sdk-model/references/agents/discovery.md && \
grep -q "Locate the Rails app" skills/build-strata-sdk-model/references/agents/discovery.md && \
grep -q "bundle show strata" skills/build-strata-sdk-model/references/agents/discovery.md && \
grep -q "type_catalog" skills/build-strata-sdk-model/references/agents/discovery.md && \
echo PASS || echo FAIL
```
Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/agents/discovery.md
git commit -m "$(cat <<'EOF'
Add discovery agent reference (ports SDK detection + gem reading)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `agents/suggestion.md` — suggestion agent instructions

**Files:**
- Create: `skills/build-strata-sdk-model/references/agents/suggestion.md`
- Port from: current `SKILL.md` lines 194–234 (Step 4d starter sets + app-type tables).

The suggestion agent proposes attributes that are likely **missing** but important. It returns `proposals[]` only — it does **not** write the spec (the user picks first, at Checkpoint 1).

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/agents/suggestion.md` with these sections:

1. **`# Suggestion agent`** — role: "You read the model spec (model definition + SDK facts) and propose attributes that are likely missing but important for this kind of application. You return a `proposals` array and write nothing."
2. **`## What to read`** — the spec at the path the workflow gave you: `model_kind`, `app_type`, `purpose`, the current `## Attributes` table, and `## SDK facts` (`type_catalog`, `base_attributes`).
3. **`## Rules`** —
   - Never propose a base attribute listed in `base_attributes` (e.g. `user_id`, `status`, `submitted_at`).
   - Map every proposal to a Strata type from `type_catalog` when one fits (`typed: true`); otherwise use a Rails primitive and set `typed: false`.
   - Each proposal needs a one-line `rationale` tied to `purpose`/`app_type`.
   - Propose only attributes not already present in the table.
4. **`## Starter sets by kind`** — port the per-kind guidance from current lines 202–232: the plain-model examples (lines 202–207), the application-form "Always + per-app-type" table (lines 208–219), the case bookkeeping additions (lines 222–228), the business-process "no attributes — capture steps instead" note (line 230), and the task "rarely adds columns" note (line 232). Reframe as "propose"-oriented bullets.
5. **`## Example`** — show a concrete `proposals` array for a `free-school-lunch` application form: `household_size:integer (typed:false)`, `children_in_household:integer`, `monthly_income:money (typed:true)`, `categorical_eligibility:string` (SNAP/TANF), `school_name:string`, `school_district:string`, `foster_child:boolean`, `homeless_or_migrant:boolean` — each with a rationale.

- [ ] **Step 2: Verify**

Run:
```bash
test -f skills/build-strata-sdk-model/references/agents/suggestion.md && \
grep -q "# Suggestion agent" skills/build-strata-sdk-model/references/agents/suggestion.md && \
grep -q "proposals" skills/build-strata-sdk-model/references/agents/suggestion.md && \
grep -q "Starter sets by kind" skills/build-strata-sdk-model/references/agents/suggestion.md && \
grep -qi "free-school-lunch" skills/build-strata-sdk-model/references/agents/suggestion.md && \
echo PASS || echo FAIL
```
Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/agents/suggestion.md
git commit -m "$(cat <<'EOF'
Add suggestion agent reference (ports starter-set + app-type tables)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `agents/attribute-audit.md` — audit agent instructions

**Files:**
- Create: `skills/build-strata-sdk-model/references/agents/attribute-audit.md`
- Derived from: current `SKILL.md` type guidance in Step 4d (lines 208–220), validation/standards notes in 4e (lines 244–256), and the pitfalls table (lines 466–483).

The audit agent flags attributes whose type is wrong or which fail SDK standards. It returns `flags[]` (possibly empty). It does not fix anything — that's resolution's job.

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/agents/attribute-audit.md` with these sections:

1. **`# Audit agent`** — role: "You read the model spec and audit every attribute in the `## Attributes` table against the SDK facts and Strata standards. You return a `flags` array — one entry per problem found, empty if the spec is clean. You change nothing."
2. **`## Checks to run`** — a numbered checklist applied to each attribute:
   1. **Invalid type** — the declared type is neither a Rails primitive (`string`, `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `references`, `uuid`, `jsonb`) nor a Strata type in `type_catalog`. → flag.
   2. **Wrong type for meaning** — a typed concept declared as a primitive. Heuristics to flag: any `*_date`/`birth*`/`dob` as `string`/`date` when `memorable_date` exists → suggest `memorable_date`; any money/income/amount/salary/wage field as `string`/`integer`/`decimal` → suggest `money`; any `ssn`/`social_security*` as `string` → suggest `ssn`; any `*address*` as `string` when `address` exists → suggest `address`; any full-name field as `string` when `name` exists → suggest `name`; any EIN/tax-id as `string` → suggest `tax_id`.
   3. **Duplicate of a base attribute** — the attribute name matches one in `base_attributes` → flag as redundant (the base class already provides it).
   4. **Standards** — for application forms, note attributes that should validate only `on: :submit` (port the rationale from current lines 256). For cases, note that links to the application form are query-based, not associations (current lines 222, 437, 475). For tasks, note `strata_tasks` is shared STI — no per-task columns expected (current lines 232, 439, 482).
3. **`## Severity`** — `high` = invalid type or wrong-type for a sensitive concept (money/ssn/date); `medium` = duplicate base attr or missing typed widget where one clearly applies; `low` = stylistic/naming.
4. **`## Output`** — one `flags` entry per problem: `{attr, issue, severity, suggested_fix}`. Do not flag attributes that are already correct. Return `flags: []` if everything passes.

- [ ] **Step 2: Verify**

Run:
```bash
test -f skills/build-strata-sdk-model/references/agents/attribute-audit.md && \
grep -q "# Audit agent" skills/build-strata-sdk-model/references/agents/attribute-audit.md && \
grep -q "Checks to run" skills/build-strata-sdk-model/references/agents/attribute-audit.md && \
grep -q "memorable_date" skills/build-strata-sdk-model/references/agents/attribute-audit.md && \
grep -q "suggested_fix" skills/build-strata-sdk-model/references/agents/attribute-audit.md && \
echo PASS || echo FAIL
```
Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/agents/attribute-audit.md
git commit -m "$(cat <<'EOF'
Add attribute-audit agent reference (type/standards checks)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `agents/resolution.md` — resolution agent instructions

**Files:**
- Create: `skills/build-strata-sdk-model/references/agents/resolution.md`

The resolution agent adversarially re-checks each audit flag, then applies only confirmed fixes, returning the full revised attribute list plus a changelog.

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/agents/resolution.md` with these sections:

1. **`# Resolution agent`** — role: "You receive the audit flags and the model spec. You do NOT trust the auditor. For each flag you independently decide `confirmed` or `rejected`, with a reason. You apply only confirmed fixes, then return the full revised attribute list and a changelog. You change nothing on disk — the orchestrator persists your output."
2. **`## Adjudication protocol`** —
   - Re-derive the correct type for the flagged attribute from the SDK `type_catalog` and the attribute's meaning, *independently* of the auditor's suggestion.
   - If your independent conclusion matches the flag → `confirmed`; apply the fix.
   - If the attribute is actually correct as-is → `rejected`; leave it unchanged and record why the flag was a false positive (example: `household_size:integer` is correct — a count is an integer, not `money`).
   - Never invent new problems the auditor didn't raise; your scope is the supplied flags only.
3. **`## Output`** — return `revised_attrs` (the **entire** corrected attribute list, not just the changed ones — each `{name, type, source, status, note}`; set `status: resolved` on changed rows, preserve others) and `changelog` (`{attr, action, flag_verdict, why}` per adjudicated flag).
4. **`## Note`** — if `flags` was empty, return `revised_attrs` equal to the current attribute list unchanged and an empty `changelog`.

- [ ] **Step 2: Verify**

Run:
```bash
test -f skills/build-strata-sdk-model/references/agents/resolution.md && \
grep -q "# Resolution agent" skills/build-strata-sdk-model/references/agents/resolution.md && \
grep -q "Adjudication protocol" skills/build-strata-sdk-model/references/agents/resolution.md && \
grep -q "revised_attrs" skills/build-strata-sdk-model/references/agents/resolution.md && \
grep -q "changelog" skills/build-strata-sdk-model/references/agents/resolution.md && \
echo PASS || echo FAIL
```
Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/agents/resolution.md
git commit -m "$(cat <<'EOF'
Add resolution agent reference (adversarial flag adjudication)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `agents/implementation.md` — implementation agent instructions

**Files:**
- Create: `skills/build-strata-sdk-model/references/agents/implementation.md`
- Port from: current `SKILL.md` Step 5 (lines 308–330, plan), Step 6 (lines 334–351, collision check), Step 7 (lines 355–414, generators per kind), Step 8 (lines 418–441, TDD-strengthen), Step 9 (lines 445–454, verification gate).

The implementation agent is the only one that writes the Rails app. It turns the confirmed spec into the committed plan, generates, strengthens test-first, lands `make lint` + `make test` green, then deletes the temp spec.

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/agents/implementation.md` with these sections:

1. **`# Implementation agent`** — role: "You implement the confirmed model. You read the confirmed model spec and SDK facts, write the committed plan, run the SDK generator, strengthen the model test-first, and get `make lint` + `make test` green. You work inside the Rails app directory given to you."
2. **`## 1. Write the committed plan`** — follow `../writing-plans.md`; save to `<RAILS_DIR>/docs/plans/<YYYY-MM-DD>-<model-kebab>.md`. Port the plan-header requirements from current lines 312–323 (model facts, attributes table with primitive flags, derived validations, generator command, variant-specific lifecycle, out-of-scope list). **Derive default validations here** from the attribute names/types using the table ported from current lines 244–256 (this is where validations enter — they are not in the spec).
3. **`## 2. Check for collisions`** — port current lines 334–351 (the `ls` checks per kind); if a target file exists, stop and report rather than overwrite.
4. **`## 3. Generate`** — port the per-kind generator commands from current lines 359–414 verbatim (plain, application_form, case, business_process, task), using the exact `generator_cmd`/`verified_flags` from the spec's SDK facts. Keep the warnings (chained migrations, hyphenated flags, shared `strata_tasks` table, BP has no migration, re-read `config/application.rb`).
5. **`## 4. TDD-strengthen`** — port current lines 420–441 (the RED→GREEN→commit loop and the variant-specific reminders). Follow `../test-driven-development.md`. Every change on top of generator output is test-first.
6. **`## 5. Verification gate`** — port current lines 445–454: run `make lint` and `make test` in the same message, read full output, zero failures, no paraphrasing prior runs. (This absorbs the removed `verification.md`.)
7. **`## 6. Clean up`** — delete the temp spec file (`<RAILS_DIR>/tmp/strata-model-spec-<model-kebab>.md`).
8. **`## Return`** — a concise report: files written, generator command run, plan path, and the final `make lint`/`make test` status.

- [ ] **Step 2: Verify**

Run:
```bash
test -f skills/build-strata-sdk-model/references/agents/implementation.md && \
grep -q "# Implementation agent" skills/build-strata-sdk-model/references/agents/implementation.md && \
grep -q "Write the committed plan" skills/build-strata-sdk-model/references/agents/implementation.md && \
grep -q "TDD-strengthen" skills/build-strata-sdk-model/references/agents/implementation.md && \
grep -q "make test" skills/build-strata-sdk-model/references/agents/implementation.md && \
grep -q "Clean up" skills/build-strata-sdk-model/references/agents/implementation.md && \
echo PASS || echo FAIL
```
Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/agents/implementation.md
git commit -m "$(cat <<'EOF'
Add implementation agent reference (ports generate + TDD + gate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `agents/review.md` — review agent instructions

**Files:**
- Create: `skills/build-strata-sdk-model/references/agents/review.md`

The review agent runs an autonomous, test-first fix loop on the implemented changes, then reports.

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/agents/review.md` with these sections:

1. **`# Review agent`** — role: "You review the code changes the implementation agent just made and autonomously fix clear issues, staying test-first. You work inside the Rails app directory."
2. **`## What to review`** — the diff (`git diff` / recently changed files), the confirmed spec, and the committed plan. Optionally invoke the repo's `code-review` skill for the review pass.
3. **`## Fix loop`** —
   - For each clear correctness / lint / test issue: write a failing spec first, run it and watch it fail for the right reason, make the minimal fix, re-run `make lint` + `make test` until green. Loop until no new issues and the suite is clean.
   - **Behavior guard:** anything that would change the model's *intended public behavior* (the spec's attributes, validations, or lifecycle) is **flagged in the report, not silently applied**.
4. **`## Exit condition`** — `make lint` + `make test` green with no remaining findings.
5. **`## Return`** — a report: findings, fixes applied (with the spec name for each), and any behavior-altering items flagged for the user.

- [ ] **Step 2: Verify**

Run:
```bash
test -f skills/build-strata-sdk-model/references/agents/review.md && \
grep -q "# Review agent" skills/build-strata-sdk-model/references/agents/review.md && \
grep -q "Fix loop" skills/build-strata-sdk-model/references/agents/review.md && \
grep -q "Behavior guard" skills/build-strata-sdk-model/references/agents/review.md && \
grep -q "Exit condition" skills/build-strata-sdk-model/references/agents/review.md && \
echo PASS || echo FAIL
```
Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/agents/review.md
git commit -m "$(cat <<'EOF'
Add review agent reference (autonomous test-first fix loop)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `workflows/run-1-discovery.js` — discovery workflow

**Files:**
- Create: `skills/build-strata-sdk-model/references/workflows/run-1-discovery.js`

This script defines `SDK_FACTS_SCHEMA` (the canonical shape the discovery agent returns) and dispatches the discovery agent.

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/workflows/run-1-discovery.js` with exactly:

```javascript
export const meta = {
  name: 'strata-model-discovery',
  description: 'Locate the Rails app, verify Ruby, detect and read the Strata SDK, return SDK facts',
  phases: [{ title: 'Discovery', detail: 'read gem source, return structured SDK facts' }],
}

const SDK_FACTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rails_dir: { type: 'string', description: 'Absolute path to the Rails app, or empty string if none found' },
    ruby_ok: { type: 'boolean' },
    sdk_present: { type: 'boolean' },
    gem_path: { type: 'string' },
    variants: {
      type: 'object',
      description: 'Per-variant facts keyed by kind (application_form, case, business_process, task)',
      additionalProperties: {
        type: 'object',
        properties: {
          generator_cmd: { type: 'string' },
          verified_flags: { type: 'array', items: { type: 'string' } },
          produces: { type: 'string' },
          base_class_summary: { type: 'string' },
          base_attrs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    type_catalog: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['rails_dir', 'ruby_ok', 'sdk_present'],
}

phase('Discovery')

const facts = await agent(
  [
    'You are the discovery agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/discovery.md and follow them exactly.`,
    `Begin searching for the Rails app from: ${args.start_dir}`,
    'Do not ask questions and do not write files. Record any ambiguity in the notes field.',
    'Return the structured SDK facts object.',
  ].join('\n'),
  { label: 'discovery', agentType: 'general-purpose', schema: SDK_FACTS_SCHEMA },
)

return facts
```

- [ ] **Step 2: Verify structural sanity**

Run (using `check_wf` from the Verification surface section):
```bash
check_wf skills/build-strata-sdk-model/references/workflows/run-1-discovery.js
grep -q "SDK_FACTS_SCHEMA" skills/build-strata-sdk-model/references/workflows/run-1-discovery.js && echo "OK: schema defined" || echo "FAIL"
grep -q "schema: SDK_FACTS_SCHEMA" skills/build-strata-sdk-model/references/workflows/run-1-discovery.js && echo "OK: schema passed to agent" || echo "FAIL"
```
Expected: all `OK:` lines, no `FAIL`.

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/workflows/run-1-discovery.js
git commit -m "$(cat <<'EOF'
Add run-1 discovery workflow script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `workflows/run-2-suggest.js` — suggestion workflow

**Files:**
- Create: `skills/build-strata-sdk-model/references/workflows/run-2-suggest.js`

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/workflows/run-2-suggest.js` with exactly:

```javascript
export const meta = {
  name: 'strata-model-suggest',
  description: 'Suggest attributes likely missing from the model spec, based on app type and SDK facts',
  phases: [{ title: 'Suggest', detail: 'propose missing attributes' }],
}

const PROPOSALS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          typed: { type: 'boolean', description: 'true if mapped to a Strata typed widget, false if a Rails primitive' },
          rationale: { type: 'string' },
        },
        required: ['name', 'type', 'typed', 'rationale'],
      },
    },
  },
  required: ['proposals'],
}

phase('Suggest')

const result = await agent(
  [
    'You are the suggestion agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/suggestion.md and follow them exactly.`,
    `Read the model spec at ${args.spec_path} (model definition + SDK facts).`,
    'Propose attributes likely MISSING but important for this kind of application.',
    'Never propose base attributes already provided by the SDK base class.',
    'Return the proposals array (empty if nothing to add).',
  ].join('\n'),
  { label: 'suggestion', agentType: 'general-purpose', schema: PROPOSALS_SCHEMA },
)

return result
```

- [ ] **Step 2: Verify**

Run:
```bash
check_wf skills/build-strata-sdk-model/references/workflows/run-2-suggest.js
grep -q "schema: PROPOSALS_SCHEMA" skills/build-strata-sdk-model/references/workflows/run-2-suggest.js && echo "OK: schema passed" || echo "FAIL"
```
Expected: all `OK:`, no `FAIL`.

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/workflows/run-2-suggest.js
git commit -m "$(cat <<'EOF'
Add run-2 suggest workflow script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `workflows/run-3-audit-resolve.js` — audit→resolve workflow

**Files:**
- Create: `skills/build-strata-sdk-model/references/workflows/run-3-audit-resolve.js`

Two sequential agents: audit returns flags; resolution adjudicates those flags. Sequential `await` (single spec, no fan-out — `pipeline()` is unnecessary).

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/workflows/run-3-audit-resolve.js` with exactly:

```javascript
export const meta = {
  name: 'strata-model-audit-resolve',
  description: 'Audit the spec attributes for type/standards issues, then adversarially resolve the flags',
  phases: [
    { title: 'Audit', detail: 'flag wrong types / non-standard attrs' },
    { title: 'Resolve', detail: 'adversarially re-check flags and apply confirmed fixes' },
  ],
}

const FLAGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attr: { type: 'string' },
          issue: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          suggested_fix: { type: 'string' },
        },
        required: ['attr', 'issue', 'severity', 'suggested_fix'],
      },
    },
  },
  required: ['flags'],
}

const RESOLUTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    revised_attrs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          source: { type: 'string' },
          status: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['name', 'type', 'source', 'status'],
      },
    },
    changelog: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attr: { type: 'string' },
          action: { type: 'string' },
          flag_verdict: { type: 'string', enum: ['confirmed', 'rejected'] },
          why: { type: 'string' },
        },
        required: ['attr', 'action', 'flag_verdict', 'why'],
      },
    },
  },
  required: ['revised_attrs', 'changelog'],
}

phase('Audit')

const audit = await agent(
  [
    'You are the audit agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/attribute-audit.md and follow them exactly.`,
    `Read the model spec at ${args.spec_path}.`,
    'Flag every attribute whose type is invalid, is the wrong type for its meaning, duplicates a base attribute, or fails SDK standards.',
    'Return the flags array (empty if nothing is wrong).',
  ].join('\n'),
  { label: 'audit', agentType: 'general-purpose', schema: FLAGS_SCHEMA },
)

phase('Resolve')

const resolution = await agent(
  [
    'You are the resolution agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/resolution.md and follow them exactly.`,
    `Read the model spec at ${args.spec_path}.`,
    'Adjudicate these audit flags (JSON). Decide confirmed or rejected for each, independently:',
    JSON.stringify(audit.flags, null, 2),
    'Apply only confirmed fixes. Return revised_attrs (the full corrected attribute list) and changelog.',
  ].join('\n'),
  { label: 'resolution', agentType: 'general-purpose', schema: RESOLUTION_SCHEMA },
)

return { flags: audit.flags, resolution }
```

- [ ] **Step 2: Verify**

Run:
```bash
check_wf skills/build-strata-sdk-model/references/workflows/run-3-audit-resolve.js
grep -q "schema: FLAGS_SCHEMA" skills/build-strata-sdk-model/references/workflows/run-3-audit-resolve.js && echo "OK: audit schema" || echo "FAIL"
grep -q "schema: RESOLUTION_SCHEMA" skills/build-strata-sdk-model/references/workflows/run-3-audit-resolve.js && echo "OK: resolution schema" || echo "FAIL"
grep -q "audit.flags" skills/build-strata-sdk-model/references/workflows/run-3-audit-resolve.js && echo "OK: flags handed to resolution" || echo "FAIL"
```
Expected: all `OK:`, no `FAIL`.

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/workflows/run-3-audit-resolve.js
git commit -m "$(cat <<'EOF'
Add run-3 audit-resolve workflow script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `workflows/run-4-implement-review.js` — implement→review workflow

**Files:**
- Create: `skills/build-strata-sdk-model/references/workflows/run-4-implement-review.js`

Two sequential agents that do real work and return prose (no schema). The review agent receives the implementation report for context.

- [ ] **Step 1: Write the file**

Create `skills/build-strata-sdk-model/references/workflows/run-4-implement-review.js` with exactly:

```javascript
export const meta = {
  name: 'strata-model-implement-review',
  description: 'Implement the confirmed model via the SDK generator + TDD, then review and fix autonomously',
  phases: [
    { title: 'Implement', detail: 'plan, generate, TDD-strengthen, lint + test green' },
    { title: 'Review', detail: 'autonomous test-first fix loop until clean' },
  ],
}

phase('Implement')

const implReport = await agent(
  [
    'You are the implementation agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/implementation.md and follow them exactly.`,
    `Read the confirmed model spec at ${args.spec_path}.`,
    `Work inside the Rails app at ${args.rails_dir}.`,
    'Convert the confirmed spec into the committed plan, run the SDK generator, strengthen the model test-first,',
    'and get `make lint` and `make test` green. Then delete the temp spec file.',
    'Return a concise report: files written, generator command run, plan path, and final lint/test status.',
  ].join('\n'),
  { label: 'implementation', agentType: 'general-purpose' },
)

phase('Review')

const reviewReport = await agent(
  [
    'You are the review agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/review.md and follow them exactly.`,
    `Work inside the Rails app at ${args.rails_dir}.`,
    'Review the code changes just implemented. Fix clear correctness/lint/test issues TEST-FIRST and re-run',
    '`make lint` + `make test` until clean. Flag (do not silently apply) any change to intended public behavior.',
    'Implementation report for context:',
    implReport,
    'Return a report of findings and the fixes you applied.',
  ].join('\n'),
  { label: 'review', agentType: 'general-purpose' },
)

return { implReport, reviewReport }
```

- [ ] **Step 2: Verify**

Run:
```bash
check_wf skills/build-strata-sdk-model/references/workflows/run-4-implement-review.js
grep -q "implReport" skills/build-strata-sdk-model/references/workflows/run-4-implement-review.js && echo "OK: report threaded" || echo "FAIL"
grep -q "agents/implementation.md" skills/build-strata-sdk-model/references/workflows/run-4-implement-review.js && \
grep -q "agents/review.md" skills/build-strata-sdk-model/references/workflows/run-4-implement-review.js && echo "OK: both refs cited" || echo "FAIL"
```
Expected: all `OK:`, no `FAIL`.

- [ ] **Step 3: Commit**

```bash
git add skills/build-strata-sdk-model/references/workflows/run-4-implement-review.js
git commit -m "$(cat <<'EOF'
Add run-4 implement-review workflow script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Rewrite `SKILL.md` as the orchestrator + remove `verification.md` symlink

**Files:**
- Modify (full rewrite): `skills/build-strata-sdk-model/SKILL.md`
- Delete: `skills/build-strata-sdk-model/references/verification.md` (symlink)

The new `SKILL.md` is the orchestration script: it owns user interaction, the temp spec, and the four `Workflow` invocations. Keep it under 500 lines.

- [ ] **Step 1: Remove the obsolete symlink**

Run:
```bash
git rm skills/build-strata-sdk-model/references/verification.md
```
Expected: `rm 'skills/build-strata-sdk-model/references/verification.md'`

- [ ] **Step 2: Rewrite `SKILL.md`**

Overwrite `skills/build-strata-sdk-model/SKILL.md`. Required content, in order:

1. **Frontmatter** — `name: build-strata-sdk-model` (must match the directory) and this description (third person, no first/second person, ≤ 250 chars):

   ```
   Adds a single Rails model — plain ActiveRecord or a Strata SDK variant (application form, case, business process, task) — via a guided multi-agent workflow that proposes, audits, and verifies attributes before test-first implementation.
   ```

2. **`# Build Strata SDK Model`** + **`## Overview`** — explain: one model per invocation; the skill is the orchestrator; four `Workflow` runs split by two checkpoints; subagents read references + the temp spec and return data; the skill owns all user interaction and spec writes. Link `references/model-spec-schema.md`.

3. **`## Setup`** — instruct the orchestrator to resolve two absolute paths once: `<REFS>` = this skill's `references/` directory, and `<START_DIR>` = the current working directory. State that `<REFS>` is passed to every run as `args.refs_dir`.

4. **`## Run 1 — Discovery`** — read `references/workflows/run-1-discovery.js` and call `Workflow` with `script` = its contents and `args: { refs_dir: "<REFS>", start_dir: "<START_DIR>" }`. Store the returned SDK facts. If `sdk_present` is false, tell the user only a plain model is possible (offer to stop so they can add `gem "strata"`); if `rails_dir` is empty, stop and report (no Rails app found). Show the exact `Workflow` call shape:

   ```
   Workflow({ script: <contents of references/workflows/run-1-discovery.js>,
              args: { refs_dir: "<REFS>", start_dir: "<START_DIR>" } })
   ```

5. **`## Questions`** — present model kinds filtered by `sdk_present` (plain always; application_form/case/business_process/task only if present). Collect `model_name` (PascalCase), `model_kind`, `app_type` (application forms only), `purpose`, and any attributes the user already has in mind. Then create the temp spec at `<RAILS_DIR>/tmp/strata-model-spec-<model-kebab>.md` per `references/model-spec-schema.md`, writing the frontmatter, the `## SDK facts` section from Run 1, and the initial `## Attributes` rows (`source: user`). Set `status: draft`.

6. **`## Run 2 — Suggest`** — call `Workflow` with `references/workflows/run-2-suggest.js` and `args: { refs_dir, spec_path }`. Receive `proposals`.

7. **`## Checkpoint 1`** — present the proposals to the user; for each, the user adds or disregards (or edits name/type). Append accepted attributes to the spec's `## Attributes` table with `source: suggested`, `status: accepted`. Set `status: suggested`.

8. **`## Run 3 — Audit → Resolve`** — call `Workflow` with `references/workflows/run-3-audit-resolve.js` and `args: { refs_dir, spec_path }`. Receive `{ flags, resolution }`. Write `## Audit flags` and `## Resolution changelog` to the spec, and replace the `## Attributes` table with `resolution.revised_attrs`. Set `status: resolved`.

9. **`## Checkpoint 2`** — present the revised attributes table + the changelog (including rejected false positives) to the user. The user confirms or edits. On edit, re-run Run 3 against the edited spec. On confirm, set `status: confirmed`.

10. **`## Run 4 — Implement → Review`** — call `Workflow` with `references/workflows/run-4-implement-review.js` and `args: { refs_dir, spec_path, rails_dir }`. Receive `{ implReport, reviewReport }`.

11. **`## Report`** — confirm the temp spec was deleted; report files written, the plan path, and `make lint`/`make test` status; surface any behavior-altering items the review agent flagged.

12. **`## Common pitfalls`** — a trimmed table. Keep the still-relevant rows from current lines 466–483: SDK not in bundle; BP hyphenated flags; AF extends `ApplicationRecord`; skipped RED step; migration conflict on rerun; post-submit edit returns false not raises; BP has no migration; case link is query-based; task shared `strata_tasks`; cwd is monorepo root not the app. Add one row: "Asked the user a question from inside a Workflow run → subagents can't talk to the user; move the interaction to the orchestrator at a checkpoint."

13. **`## Reference`** — list: `references/model-spec-schema.md`, the six `references/agents/*.md`, the four `references/workflows/*.js`, the kept symlinks (`test-driven-development.md`, `writing-plans.md`, `ruby-version-check.md`), and the Strata SDK upstream URL (current line 494). Do **not** mention `verification.md`.

- [ ] **Step 3: Verify the linter passes**

Run:
```bash
python scripts/lint_skills.py
```
Expected: exit 0, the skill reported as passing (no errors for `build-strata-sdk-model`).

- [ ] **Step 4: Verify the body line count and no stale verification reference**

Run:
```bash
awk '/^---$/{c++; next} c>=2' skills/build-strata-sdk-model/SKILL.md | wc -l   # body line count, must be < 500
grep -n "verification.md" skills/build-strata-sdk-model/SKILL.md && echo "FAIL: stale verification.md reference" || echo "OK: no verification.md reference"
```
Expected: a number `< 500`, then `OK: no verification.md reference`.

- [ ] **Step 5: Commit**

```bash
git add skills/build-strata-sdk-model/SKILL.md skills/build-strata-sdk-model/references/verification.md
git commit -m "$(cat <<'EOF'
Rewrite build-strata-sdk-model SKILL.md as Workflow orchestrator

Replaces the linear 10-step skill with a segmented multi-agent pipeline
(4 Workflow runs, 2 checkpoints). Removes the verification.md symlink;
its completion gate now lives in the implementation and review agents.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the linter + its unit tests**

Run:
```bash
python scripts/lint_skills.py && python -m pytest tests/test_lint_skills.py -q
```
Expected: linter exit 0; pytest all passing.

- [ ] **Step 2: Confirm every referenced file exists**

Run:
```bash
cd skills/build-strata-sdk-model
for f in references/model-spec-schema.md \
         references/agents/discovery.md references/agents/suggestion.md \
         references/agents/attribute-audit.md references/agents/resolution.md \
         references/agents/implementation.md references/agents/review.md \
         references/workflows/run-1-discovery.js references/workflows/run-2-suggest.js \
         references/workflows/run-3-audit-resolve.js references/workflows/run-4-implement-review.js \
         references/test-driven-development.md references/writing-plans.md references/ruby-version-check.md; do
  test -e "$f" && echo "OK  $f" || echo "MISSING  $f"
done
test -e references/verification.md && echo "FAIL: verification.md still present" || echo "OK: verification.md removed"
cd -
```
Expected: every line `OK`, the last line `OK: verification.md removed`, no `MISSING`/`FAIL`.

- [ ] **Step 3: Structural sanity on all four workflow scripts**

Run (with `check_wf` defined):
```bash
for f in skills/build-strata-sdk-model/references/workflows/run-*.js; do echo "== $f =="; check_wf "$f"; done
```
Expected: every script reports all `OK:` lines, no `FAIL`.

- [ ] **Step 4: Manual E2E (deferred, documented)**

The functional end-to-end run — execute the full pipeline against a real Strata Rails app and confirm both checkpoints fire, the changelog records ≥1 confirmed and ≥1 rejected flag, and the implementation run lands `make lint` + `make test` green — is the spec's manual validation step. Note it as the remaining acceptance gate; it cannot run inside the skills repo.

---

## Self-review

**Spec coverage** (each spec section → task):
- Pipeline shape (4 runs, 2 checkpoints) → Task 12 (orchestrator) + Tasks 8–11 (scripts). ✓
- Temp spec file & schema → Task 1; created/written by Task 12. ✓
- Per-agent contracts (6 agents) → Tasks 2–7 (instructions) + Tasks 8–11 (dispatch + schemas). ✓
- Dedicated discovery agent (decision 2) → Tasks 2, 8. ✓
- Spec → becomes the plan (decision 1) → Task 6 §1 + §6 (write plan, delete spec). ✓
- Autonomous test-first review loop (decision 3) → Tasks 7, 11. ✓
- File restructuring + `attribute-audit.md` fresh name (decision 7) → Tasks 4, 12. ✓
- `verification.md` removed; content absorbed → Task 12 §1 + Task 6 §5 + Task 7. ✓
- Bundled `.js` read-and-passed-inline (decision 8) → Task 12 §4/§6/§8/§10. ✓
- Validations deferred to plan (decision 6) → Task 6 §1. ✓
- Linter (≤500 lines, description rules) → Task 12 §3–4, Task 13 §1. ✓

**Placeholder scan:** No `TBD`/`TODO`/"handle edge cases". Reference-file tasks cite exact current-`SKILL.md` line ranges to port (the source exists in-repo); workflow scripts and the schema file contain complete content. ✓

**Type/name consistency:** `args` keys are consistent across scripts and orchestrator — `refs_dir` (all runs), `start_dir` (Run 1), `spec_path` (Runs 2–4), `rails_dir` (Run 4). Schema names (`SDK_FACTS_SCHEMA`, `PROPOSALS_SCHEMA`, `FLAGS_SCHEMA`, `RESOLUTION_SCHEMA`) are each defined in exactly one script. Reference filenames match between the file-structure map, the workflow `agent()` prompts, and the orchestrator's `## Reference` list. Spec `status` values (`draft → suggested → audited → resolved → confirmed`) match between Task 1 and Task 12's checkpoint steps. ✓
