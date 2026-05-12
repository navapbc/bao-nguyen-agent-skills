# Skill Quality Rubric

This document is the single source of truth for the substance-level quality bar applied to `SKILL.md` files in this repo. The CI agent (`scripts/eval_skills/`) reads it at evaluation time. To change agent behavior, edit this file and bump `RUBRIC_VERSION` in `scripts/eval_skills/cache.ts`.

The agent scores four dimensions and assigns each finding to one of three tiers.

## Dimensions

### A — Triggerability

The description must give a future Claude clear, specific signal to invoke this skill over any other.

**Pass:** description names a concrete domain noun, names the user-action or trigger phrase, and contains no ambiguity that would cause it to fire on unrelated requests. The description is also distinguishable from every other skill's description in the repo.

**Warn:** description is functional but vague, or partially overlaps a sibling skill's trigger phrase without enough disambiguator.

**Fail (critical):** description is fewer than 30 characters of substantive content, contains no domain nouns, is a pure restatement of the skill `name`, or **collides with another skill's description** such that two skills would compete for the same trigger.

#### Collision-check guidance

You are given the changed skill's content **and a sibling-skill index** containing every other skill's `name` + `description`. For each sibling, decide: would a typical user request that matches this skill's description *also* match the sibling's description, with no clear way for Claude to disambiguate? If yes, emit a critical finding under dimension A with `colliding_skill` populated.

A collision is **not** mere topical overlap. Two skills can both relate to "Slack" without colliding — they collide only when their trigger phrases or user-intent descriptions overlap so strongly that Claude could not reliably choose between them.

### B — Instructional clarity

The body must teach the reader **how** to do the thing, not just describe **what** the thing is.

**Pass:** body has at least 20 lines of substantive content (excluding frontmatter and section headings), at least one concrete example or runnable snippet, and no placeholder tokens.

**Warn:** body is short or example-free but still actionable.

**Fail (critical):** body contains placeholder tokens (`TODO`, `TBD`, `XXX`, `Lorem ipsum`), has fewer than 20 lines of substantive content, or contains zero concrete examples.

### C — Self-containedness

The skill must be usable without hidden context.

**Pass:** every file path or `references/...` resource mentioned in the body exists in the repo at the path stated.

**Warn:** mention of an external resource without a clear pointer (acceptable but suboptimal).

**Fail (critical):** any file path or `references/...` resource referenced in the body does not exist in the repo.

### D — Anti-patterns absent

The skill must follow the project's authoring standards.

**Pass:** no first- or second-person voice in the description, no contradictions with `CLAUDE.md` rules, no filler phrases.

**Warn:** filler phrases ("just", "simply", "basically") in the body, or other minor style issues.

**Fail (critical):** first- or second-person voice in the description (overlaps with the linter — this dimension acts as a confirmation gate), or content directly contradicts a rule stated in `CLAUDE.md`.

## Severity tiers

- **critical** → fails the pipeline (`exit 1`). The skill is broken or unusable as-is.
- **major** → surfaces as a `::warning` annotation and PR comment entry. Does not fail the pipeline.
- **minor** → surfaces in the PR comment only. Does not annotate or fail.

A finding is `critical` only if it falls into the explicit categories above. When in doubt, downgrade to `major`.
