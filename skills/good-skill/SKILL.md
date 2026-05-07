---
name: good-skill
description: Generates a weekly status report from Linear issues filtered by team and date range, producing a markdown summary.
---

# Good Skill

This skill generates a weekly status report from Linear issues. It filters by team and date range, then produces a markdown summary suitable for posting in Slack.

## When to use

Invoke this skill when a user asks for "this week's status", "weekly report", or "what shipped this week".

## How it works

1. Query Linear for issues completed in the date range, filtered to the requested team.
2. Group issues by epic.
3. For each epic, list completed issues with assignee and PR link.
4. Render the result as markdown.

## Example

Input: `team=core, range=2026-04-29..2026-05-06`

Output:

```markdown
## Core team — week of 2026-04-29

### Epic: Auth migration
- Migrate session storage to compliance-approved store (@alice, #123)
- Backfill old sessions (@bob, #124)
```

## Edge cases

- Empty week: emit a single line "no completed issues this week" rather than an empty report.
- Missing assignee: substitute `@unassigned`.
