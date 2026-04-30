# Writing Plans (shared reference)

**Purpose:** Guide for writing comprehensive implementation plans before touching code. Assumes engineer has zero context for the codebase and questionable taste.

**Used by:** Any skill that produces implementation plans for multi-step tasks.

## Overview

Document everything an engineer needs: which files to touch, code, testing, docs to check, how to verify. Give the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume skilled developer, but knows almost nothing about the toolset or problem domain. Assume weak test design instincts.

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If spec covers multiple independent subsystems, suggest breaking into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for.

- Design units with clear boundaries and well-defined interfaces. Each file: one clear responsibility.
- Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.rb`
- Modify: `exact/path/to/existing.rb:123-145`
- Test: `spec/exact/path/to/file_spec.rb`

- [ ] **Step 1: Write the failing test**

```ruby
RSpec.describe ClassName do
  describe "#method_name" do
    it "does specific behavior" do
      result = subject.method_name(input)
      expect(result).to eq(expected)
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bundle exec rspec spec/path/file_spec.rb`
Expected: FAIL with "undefined method `method_name'"

- [ ] **Step 3: Write minimal implementation**

```ruby
def method_name(input)
  expected
end
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bundle exec rspec spec/path/file_spec.rb`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add spec/path/file_spec.rb app/path/file.rb
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, methods, or classes not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, check against spec with fresh eyes. Run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement. Can you point to a task that implements it? List gaps.

**2. Placeholder scan:** Search for red flags — any patterns from "No Placeholders" above. Fix them.

**3. Type consistency:** Do method signatures and property names in later tasks match what you defined in earlier tasks? A method called `clear_layers` in Task 3 but `clear_full_layers` in Task 7 is a bug.

If you find issues, fix them inline. If you find a spec requirement with no task, add the task.
