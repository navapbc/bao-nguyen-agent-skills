# Strata SDK Reference

Authoritative knowledge of the Strata SDK Rails engine: docs, generators, models, UI surfaces, authorization, and pitfalls. Skills that touch the SDK should read this **before** planning, generating code, or answering SDK questions. Trust the SDK clone over this file when they disagree — re-read the relevant doc and update this file.

The SDK lives at `https://github.com/navapbc/strata-sdk-rails` (locally cloned to `tmp/strata-sdk/` by skills that use it). The repo is also called `flex-sdk` upstream — both URLs resolve.

## 1. Docs catalog

```sh
ls tmp/strata-sdk/docs/
```

| Topic | Path |
|-------|------|
| Application form guide | `tmp/strata-sdk/docs/intake-application-forms.md` |
| Strata attribute types | `tmp/strata-sdk/docs/strata-attributes.md` |
| Generators overview | `tmp/strata-sdk/docs/generators.md` |
| Multi-page form flows | `tmp/strata-sdk/docs/multi-page-form-flows.md` |
| Case management business process | `tmp/strata-sdk/docs/case-management-business-process.md` |
| Authorization (Pundit) | `tmp/strata-sdk/docs/authorization.md` |

If a doc is missing, the clone is incomplete — re-clone or pin to a tag with the expected layout.

## 2. Generators inventory

```sh
ls tmp/strata-sdk/lib/generators/strata/
```

Expected: `application_form`, `application_form_views`, `business_process`, `case`, `determination`, `income_records_migration`, `migration`, `model`, `staff`, `task`. Read each `USAGE` and `*_generator.rb`. Option flags are **hyphenated** (`--business-process`, `--application-form`, `--skip-*`) — the USAGE docs sometimes show underscores, but the underscored form is silently ignored.

| Generator | What it produces | Notes |
|-----------|------------------|-------|
| `strata:application_form` | Model + auto-chains `strata:model` (writes migration with base attrs `user_id:uuid`, `status:integer`, `submitted_at:datetime`) | Auto-suffixes `ApplicationForm`. **No separate migration step needed.** |
| `strata:case` | Model at `app/models/strata/<name>_case.rb` + **staff** controller `app/controllers/<cases>_controller.rb` + staff views (`index`, `show`, `documents`, `tasks`, `notes`) + routes scoped under `/staff` + locales | Auto-suffixes `Case`. Prompts to chain BP and AF. Case has `application_form_id:uuid` attribute for query-based lookups to the application form (NOT a Rails relationship). |
| `strata:business_process` | `app/business_processes/<name>_business_process.rb` (NOT `app/models/`) + edits `config/application.rb` to register event listening | |
| `strata:application_form_views` | Applicant views from a `Strata::Flows::ApplicationFormFlow` subclass | Requires the flow class to exist first (no generator for the flow class itself). |
| `strata:migration` | Ad-hoc migrations | **Do NOT** re-run for the application form — `strata:application_form` already chains it. |
| `strata:task`, `strata:staff`, `strata:model`, `strata:determination`, `strata:income_records_migration` | Specialized | Mostly out of scope for application-form workflows. |

**Generation order (per `docs/generators.md`):** `strata:application_form` first → `strata:case` → `strata:business_process` → optional `strata:task` → define flow class → `strata:application_form_views`.

**Every code-producing step should prefer an SDK generator** over hand-writing files when a matching generator exists.

## 3. Domain model

### Relations (domain-driven, query-based — NO Rails relationships)

- Case stores `application_form_id:uuid` for query-based lookups to the application form. Use `<PROGRAM>ApplicationForm.find(application_form_id)` or the `scope :for_application_form` provided by `Strata::Case`. There is NO `belongs_to` declaration — application forms and cases are linked via queries to keep domain models flexible and prevent N+1 issues. Application forms do NOT have a `case_id`.
- `BusinessProcess` governs the case lifecycle; `business_process_current_step` lives on Case.

### `Strata::ApplicationForm` (extend in your model)

- Status enum: `in_progress` (0) → `submitted` (1)
- `submitted_at` timestamp
- `before_update :prevent_changes_if_submitted` callback enforces immutability after submit
- `after_create :publish_created`

### `Strata::Case` (extend in your case model)

- Base attrs auto-injected by `strata:case`: `application_form_id:uuid`, `status:integer`, `business_process_current_step:string`, `facts:jsonb` — do not pass these to the generator.
- Class method `business_process` returns the bound BP class.
- Class method `application_form_class` returns the application form class name (string) by convention (`name.sub("Case", "ApplicationForm")`).
- `scope :for_application_form` provides query-based lookup by `application_form_id`.
- The consuming app should define an `application_form` convenience method on the case model for direct lookup (e.g., `def application_form; <PROGRAM>ApplicationForm.find(application_form_id); end`).

### Attribute types

See `tmp/strata-sdk/docs/strata-attributes.md` for the full catalog. Strata types: `name`, `address`, `tax_id`, `memorable_date`, `money`, `us_date`, `year_month`, `year_quarter`, `array`, `range`. Common fields like `email` and `phone` are NOT Strata types — use Rails primitives (`:string`) for them. Fall back to Rails primitives (`string`, `integer`, `boolean`, `date`, `datetime`, `decimal`, `text`) for any fields the SDK doesn't model — primitive fields won't get a Strata widget and need a plain form field in the view.

## 4. Two distinct UI surfaces

| Surface | Source | URL scope | Audience |
|---------|--------|-----------|----------|
| **Staff dashboard** | Output of `strata:case` (controller + views + routes + locales) | `/staff` | Caseworkers |
| **Applicant form** | Hand-written controller + (`Strata::Flows::ApplicationFormFlow` subclass + `strata:application_form_views`) OR `bin/rails generate scaffold` | App-defined | Applicants |

These are NOT interchangeable. `strata:case` produces staff routes only — applicants cannot reach the form through them. Build the applicant surface separately.

## 5. Multi-page form flows

The SDK's preferred multi-page pattern is `Strata::Flows::ApplicationFormFlow` — a DSL of `task :group { question_page :field }` that drives auto-generated routes, controller actions, and views (via `strata:application_form_views`). Default guidance: one question per page, group only where it improves UX (e.g. name + birth date together).

The flow class is hand-written (no generator). After defining it, run:

```sh
bin/rails generate strata:application_form_views <Program>ApplicationFormFlow <Program>ApplicationForm
```

Outputs: `app/views/<program>_application_forms/edit_<page>.html.erb` per question page, `app/views/layouts/<program>_application_form.html.erb`, `config/locales/<program>_application_forms/en.yml`.

### Flow controller concern

`Strata::Flows::ApplicationFormController` (`app/models/strata/flows/application_form_controller.rb`) provides:

- `before_action :set_flow` — instantiates `@flow = flow_class.new(flow_record)`
- `before_action :set_flow_task, only: flow_class.generated_routes`
- `before_action :enforce_task_dependencies, only: flow_class.generated_routes` — redirects to `start_path` if a page's task has unmet dependencies
- `define_method` for each page's `edit_<page>` and `update_<page>` action

The concern does NOT call `authorize`. The consuming app must wire authorization itself (see Section 6).

## 6. Authorization (Pundit)

The SDK ships `Strata::ApplicationFormPolicy` (an *include-able module*, not a class) and a base `ApplicationPolicy`. **No generator emits a per-form policy file.** Without a policy class, every page raises `Pundit::NotDefinedError` at runtime — specs that only render `new`/`edit` without authentication silently miss this.

### What `Strata::ApplicationFormPolicy` provides

| Action | Rule |
|--------|------|
| `index?`, `create?`, `new?` | Any logged-in user |
| `show?` | Owner |
| `update?`, `edit?`, `review?`, `destroy?` | Owner **and** `record.in_progress?` |
| `submit?` | Owner **and** `!record.submitted?` |
| `Scope#resolve` | `scope.where(user_id: user.id)` |

The base `ApplicationPolicy#initialize` raises `Pundit::NotAuthorizedError` if `user` is `nil`.

**There are NO per-page policy methods.** Every question page in a multi-page flow uses `update?`. Never invent `edit_<page>?` methods — the flow controller never calls them.

### Required artifacts (test-first)

#### Policy class

```ruby
# app/policies/<program>_application_form_policy.rb
class <Program>ApplicationFormPolicy < ApplicationPolicy
  include Strata::ApplicationFormPolicy
end
```

If `app/policies/application_policy.rb` does not exist, run `bin/rails g pundit:install` first.

#### Policy spec — model on the SDK reference

Mirror `tmp/strata-sdk/spec/policies/strata/application_form_policy_spec.rb`:

```ruby
require 'rails_helper'

RSpec.describe <Program>ApplicationFormPolicy, type: :policy do
  subject { described_class.new(current_user, record) }

  let(:owning_user) { create(:user) }
  let(:base_record) { create(:<program>_application_form, user_id: owning_user.id) }
  let(:record) { base_record }
  let(:resolved_scope) do
    described_class::Scope.new(current_user, <Program>ApplicationForm.all).resolve
  end

  context "when unauthenticated" do
    let(:current_user) { nil }
    it { is_expected_in_block.to raise_error(Pundit::NotAuthorizedError) }
  end

  context "when owning user" do
    let(:current_user) { owning_user }
    it { is_expected.to permit_all_actions }
  end

  context "when owning user, on submitted form" do
    let(:current_user) { owning_user }
    let(:record) { base_record.submit_application; base_record }
    it { is_expected.to forbid_only_actions(:destroy, :review, :edit, :update, :submit) }
  end

  context "when not owning user" do
    let(:current_user) { build(:user) }
    it { is_expected.to permit_only_actions(:create, :index, :new) }
  end
end
```

`pundit-matchers` must be in the `:test` group of the `Gemfile`.

#### Applicant controller wiring

```ruby
class <Program>ApplicationFormsController < ApplicationController
  include Strata::Flows::ApplicationFormController
  flow Flows::<Program>ApplicationFormFlow

  before_action :authenticate_user!
  before_action :load_and_authorize_form,
                only: Flows::<Program>ApplicationFormFlow.generated_routes

  def flow_record
    @<program>_application_form
  end

  private

  def load_and_authorize_form
    @<program>_application_form = authorize(
      <Program>ApplicationForm.find(params[:id]),
      :update?
    )
  end
end
```

Use `Flow.generated_routes` for the `only:` filter — never hand-write the page list (it drifts when pages are added/removed).

#### Per-page system spec (multi-page only)

For every question page in `<FORM_LAYOUT>`, the spec must:

1. Sign in as the owning user
2. Visit `<form>/:id/edit_<page_name>`
3. Assert response is 200 (no `Pundit::NotDefinedError`, no `Pundit::NotAuthorizedError`)
4. Assert that page's expected fields render and no other page's fields appear
5. Submit valid input and assert redirect to next page (or `end_path` on the last page)

A separate context covers negative paths:

- Non-owner GET → `Pundit::NotAuthorizedError`
- Unauthenticated GET → redirect to sign-in
- Owner on submitted form GET edit page → forbidden (`update?` is false because `in_progress?` is false)

If any page raises a Pundit error, fix the policy class or controller wiring — **never** add per-page policy methods.

For single-page layout: write one request spec asserting `authorize(form, :update?)` is invoked (assert non-owner gets `NotAuthorizedError` on `edit`/`update`).

## 7. Plan validation checklist

Walk any application-form plan against these checks before generating code. Each row cites the source-of-truth file inside `tmp/strata-sdk/`.

| Check | Source of truth |
|-------|-----------------|
| Every attribute's Strata type exists (Rails primitives exempt) | `docs/strata-attributes.md` |
| Form model extends `Strata::ApplicationForm`; case model extends `Strata::Case` | `docs/intake-application-forms.md`, `docs/case-management-business-process.md` |
| Plan does NOT add `case_id` or `belongs_to :case` to the application form (Case stores `application_form_id` for query-based lookup) | `app/models/strata/case.rb` `base_attributes_for_generator` |
| Plan does NOT re-run `strata:migration` for the application form (already created by `strata:application_form` → `strata:model`) | `lib/generators/strata/application_form/application_form_generator.rb` |
| Multi-page plan defines a `Strata::Flows::ApplicationFormFlow` subclass and runs `strata:application_form_views <FLOW> <FORM>` | `docs/multi-page-form-flows.md` |
| Single-page plan uses `bin/rails generate scaffold` or hand-writes the applicant controller | `docs/intake-application-forms.md` |
| Plan distinguishes staff dashboard (from `strata:case`, `/staff` scope) from applicant form | `lib/generators/strata/case/case_generator.rb` |
| Validations expressible as Rails model validations | Rails docs |
| BP file path is `app/business_processes/`, NOT `app/models/` | `lib/generators/strata/business_process/business_process_generator.rb` |
| Plan creates `app/policies/<program>_application_form_policy.rb` (`include Strata::ApplicationFormPolicy`), policy spec, and per-page system spec; `pundit-matchers` in `:test`; NO per-page policy methods | `docs/authorization.md`, `app/models/strata/flows/application_form_controller.rb`, Section 6 above |

## 8. Common SDK pitfalls

| Problem | Fix |
|---------|-----|
| `bin/rails generate strata:...` says command not found | Gem not installed — run `bundle install` |
| Model extends `ApplicationRecord` instead of `Strata::ApplicationForm` | Edit model file, re-run tests |
| Migration missing `status` / `user_id` / `submitted_at` | These are auto-injected by `strata:application_form` base attrs — re-run the AF generator (don't hand-craft `strata:migration`) |
| Duplicate migration error | Likely re-ran `strata:migration` after `strata:application_form` — delete the duplicate |
| App form model has spurious `case_id` column or `belongs_to :case` | Wrong direction — Case stores `application_form_id` for query-based lookup. Drop the column/association from the form |
| Looked for BP in `app/models/` and found nothing | BPs live at `app/business_processes/<name>_business_process.rb` |
| `strata:case` produced views/routes but applicant cannot reach the form | Those are STAFF views under `/staff`. Build the applicant surface separately via `bin/rails generate scaffold` (single page) or flow + `strata:application_form_views` (multi-page) |
| `strata:application_form_views` errors "flow not found" | The flow class is hand-written — create `app/flows/<program>_application_form_flow.rb` first |
| `--application_form` flag (underscore) ignored | Use `--application-form` (hyphen). The USAGE doc shows underscore due to a typo |
| Clone fails with auth error, or doc file not found | Repo is public — check network/proxy/VPN; run `ls tmp/strata-sdk/` to confirm layout |
| `Pundit::NotDefinedError` on every applicant page, or tempted to write `edit_<page>?` policy methods | Policy class missing or misapplied — create `<Program>ApplicationFormPolicy` (one `update?` gates every page; never per-page methods) |
| Per-page spec passes some pages, errors on others | `before_action only:` likely a hand-written page list — replace with `Flow.generated_routes` |
| Policy spec fails with `undefined method permit_all_actions` | `pundit-matchers` not in `:test` group — add to Gemfile, `bundle install` |
| Owner gets 403 on submitted form edit page | Working as intended — `update?` checks `in_progress?`. Route post-submit traffic to a read-only `review` action |
| Every page 500s with `NoMethodError: authorize` | Controller missing `include Pundit::Authorization` — usually inherited via `ApplicationController`, verify host app |
| SDK docs conflict with this reference | Docs in the clone win — they reflect the installed gem version. Update this file. |
