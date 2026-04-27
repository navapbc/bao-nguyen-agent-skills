# Testing Anti-Patterns

**Load this reference when:** writing or changing RSpec specs, adding stubs/doubles, or tempted to add test-only methods to production Ruby code.

## Overview

Specs must verify real behavior, not stub behavior. Stubs are a means to isolate, not the thing being tested.

**Core principle:** Test what the code does, not what the stubs do.

**Following strict TDD prevents these anti-patterns.**

## The Iron Laws

```
1. NEVER test stub/double behavior
2. NEVER add test-only methods to production classes
3. NEVER stub without understanding dependencies
```

## Anti-Pattern 1: Testing Stub Behavior

**The violation:**
```ruby
# ❌ BAD: Asserting on the stub itself
RSpec.describe DashboardController, type: :controller do
  it 'renders sidebar' do
    sidebar = instance_double(SidebarComponent)
    allow(SidebarComponent).to receive(:new).and_return(sidebar)
    allow(sidebar).to receive(:render).and_return('<div data-test="sidebar-stub"/>')

    get :show

    expect(response.body).to include('sidebar-stub')
  end
end
```

**Why this is wrong:**
- You're verifying the stub renders, not that the controller renders the real sidebar
- Spec passes when stub is present, fails when it's not
- Tells you nothing about real behavior

**your human partner's correction:** "Are we testing the behavior of a stub?"

**The fix:**
```ruby
# ✅ GOOD: Test real behavior
RSpec.describe DashboardController, type: :controller do
  it 'renders the sidebar navigation' do
    get :show
    expect(response.body).to have_selector('nav[role="navigation"]')
  end
end

# OR if SidebarComponent must be isolated for speed:
# Don't assert on the stub - test the controller's behavior with sidebar present
```

### Gate Function

```
BEFORE asserting on any stub/double:
  Ask: "Am I testing real component behavior or just stub existence?"

  IF testing stub existence:
    STOP - Delete the assertion or unstub the dependency

  Test real behavior instead
```

## Anti-Pattern 2: Test-Only Methods in Production

**The violation:**
```ruby
# ❌ BAD: cleanup! only used in specs
class Session < ApplicationRecord
  def cleanup!  # Looks like a production API!
    workspace_manager&.destroy_workspace(id)
    files.destroy_all
    # ...
  end
end

# In spec_helper or a spec file
RSpec.configure do |config|
  config.after(:each) { @session&.cleanup! }
end
```

**Why this is wrong:**
- Production model polluted with test-only code
- Dangerous if accidentally called from a controller or job
- Violates YAGNI and separation of concerns
- Confuses ActiveRecord lifecycle with domain entity lifecycle

**The fix:**
```ruby
# ✅ GOOD: Test utility handles spec cleanup
# Session has no cleanup! - it's stateless in production

# spec/support/session_cleanup.rb
module SessionCleanup
  def cleanup_session(session)
    return unless session
    workspace = session.workspace_info
    WorkspaceManager.destroy_workspace(workspace.id) if workspace
    Pathname.new(session.scratch_dir).rmtree if Dir.exist?(session.scratch_dir)
  end
end

# spec/spec_helper.rb
RSpec.configure do |config|
  config.include SessionCleanup
  config.after(:each) { cleanup_session(@session) }
end
```

### Gate Function

```
BEFORE adding any method to a production class:
  Ask: "Is this only used by specs?"

  IF yes:
    STOP - Don't add it
    Put it in spec/support/ instead

  Ask: "Does this class own this resource's lifecycle?"

  IF no:
    STOP - Wrong class for this method
```

## Anti-Pattern 3: Stubbing Without Understanding

**The violation:**
```ruby
# ❌ BAD: Stub breaks the spec's own setup
RSpec.describe ServerRegistry do
  it 'detects duplicate server' do
    # Stubbing prevents the config write the spec depends on!
    allow(ToolCatalog).to receive(:discover_and_cache_tools)

    described_class.add_server(config)
    expect {
      described_class.add_server(config)
    }.to raise_error(ServerRegistry::DuplicateError)
  end
end
```

**Why this is wrong:**
- Stubbed method had a side effect the spec depended on (writing config)
- Over-stubbing to "be safe" breaks actual behavior
- Spec passes for the wrong reason or fails mysteriously

**The fix:**
```ruby
# ✅ GOOD: Stub at the correct level
RSpec.describe ServerRegistry do
  it 'detects duplicate server' do
    # Stub only the slow external part, preserve behavior the spec needs
    allow(MCPServerManager).to receive(:start)

    described_class.add_server(config)  # Config written
    expect {
      described_class.add_server(config)
    }.to raise_error(ServerRegistry::DuplicateError)
  end
end
```

### Gate Function

```
BEFORE stubbing any method:
  STOP - Don't stub yet

  1. Ask: "What side effects does the real method have?"
  2. Ask: "Does this spec depend on any of those side effects?"
  3. Ask: "Do I fully understand what this spec needs?"

  IF depends on side effects:
    Stub at a lower level (the actual slow/external operation)
    OR use real objects with test doubles for only the I/O boundary
    NOT the high-level method the spec depends on

  IF unsure what the spec depends on:
    Run the spec with the real implementation FIRST (make test)
    Observe what actually needs to happen
    THEN add minimal stubbing at the right level

  Red flags:
    - "I'll stub this to be safe"
    - "This might be slow, better stub it"
    - Stubbing without understanding the dependency chain
```

## Anti-Pattern 4: Incomplete Doubles

**The violation:**
```ruby
# ❌ BAD: Partial double - only the keys you think you need
mock_response = double('response',
  status: 'success',
  data: { user_id: '123', name: 'Alice' }
  # Missing: metadata that downstream code uses
)

# Later: NoMethodError when code calls response.metadata.request_id
```

**Why this is wrong:**
- **Partial doubles hide structural assumptions** — you only stubbed fields you know about
- **Downstream code may depend on fields you didn't include** — silent failures
- **Specs pass but integration fails** — double incomplete, real API complete
- **False confidence** — spec proves nothing about real behavior

**The Iron Rule:** Stub the COMPLETE data structure as it exists in reality, not just fields your immediate spec uses.

**The fix:**
```ruby
# ✅ GOOD: Mirror real API completeness, or use a verifying double
mock_response = double('response',
  status: 'success',
  data: { user_id: '123', name: 'Alice' },
  metadata: { request_id: 'req-789', timestamp: 1_234_567_890 }
  # All fields the real API returns
)

# Better: use instance_double to enforce the real interface
mock_response = instance_double(ApiResponse,
  status: 'success',
  data: { user_id: '123', name: 'Alice' },
  metadata: { request_id: 'req-789', timestamp: 1_234_567_890 }
)
```

### Gate Function

```
BEFORE creating a double:
  Check: "What attributes does the real object expose?"

  Actions:
    1. Examine the real class or API response
    2. Include ALL attributes the system might consume downstream
    3. Verify the double matches the real interface
    4. Prefer instance_double / class_double — they fail loudly on missing methods

  Critical:
    If you're creating a double, you must understand the ENTIRE interface
    Partial doubles fail silently when code depends on omitted attributes

  If uncertain: use the real object, or include all documented attributes
```

## Anti-Pattern 5: Specs as Afterthought

**The violation:**
```
✅ Implementation complete
❌ No specs written
"Ready for testing"
```

**Why this is wrong:**
- Specs are part of implementation, not optional follow-up
- TDD would have caught this
- Can't claim complete without `make test` and `make lint` passing

**The fix:**
```
TDD cycle:
1. Write failing spec
2. Implement to pass (make test)
3. make lint
4. Refactor (still green)
5. THEN claim complete
```

## When Doubles Become Too Complex

**Warning signs:**
- Stub setup longer than the spec body
- Stubbing everything to make the spec pass
- Doubles missing methods the real class has
- Spec breaks when the double changes

**your human partner's question:** "Do we need to be using a double here?"

**Consider:** Request specs / system specs with real Rails components are often simpler than complex doubles. Use FactoryBot for real ActiveRecord instances instead of stubbing model methods.

## TDD Prevents These Anti-Patterns

**Why TDD helps:**
1. **Write spec first** → forces you to think about what you're actually testing
2. **Watch it fail** → confirms the spec exercises real behavior, not stubs
3. **Minimal implementation** → no test-only methods creep in
4. **Real dependencies** → you see what the spec actually needs before stubbing

**If you're testing stub behavior, you violated TDD** — you added stubs without watching the spec fail against real code first.

## Quick Reference

| Anti-Pattern | Fix |
|--------------|-----|
| Assert on stub return values | Test real component or unstub it |
| Test-only methods in production | Move to spec/support/ |
| Stub without understanding | Understand dependencies first, stub minimally |
| Incomplete doubles | Mirror real interface completely; prefer `instance_double` |
| Specs as afterthought | TDD — specs first, `make test` && `make lint` before claiming done |
| Over-complex stubs | Use request/system specs with real components |

## Red Flags

- Assertion checks for `*-stub` / `*-mock` markers
- Methods only called in spec files
- Stub setup is >50% of the spec
- Spec fails when you remove a stub
- Can't explain why a stub is needed
- Stubbing "just to be safe"
- `make lint` skipped because "specs are the priority"

## The Bottom Line

**Stubs and doubles are tools to isolate, not things to test.**

If TDD reveals you're testing stub behavior, you've gone wrong.

Fix: Test real behavior or question why you're stubbing at all. Run `make test && make lint` after every change.
