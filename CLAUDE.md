# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run linter on all skills
python scripts/lint_skills.py

# Run linter unit tests
python -m pytest tests/test_lint_skills.py -v

# Run single test
python -m pytest tests/test_lint_skills.py -v -k "test_name_here"
```

## Architecture

Each skill lives in `skills/<skill-name>/SKILL.md`. The linter (`scripts/lint_skills.py`) validates all skills against 12 rules on every CI run.

**SKILL.md format:**
```markdown
---
name: skill-name
description: One sentence, third-person, max 250 chars.
---

Skill body (max 500 lines)...
```

**Linting rules enforced:**
- Directory name: lowercase, numbers, hyphens only; max 64 chars; not `helper`/`utils`/`tools`
- Frontmatter: must open and close with `---`
- `name` must match directory name exactly
- `description`: max 250 chars; no first-person ("I", "I'll") or second-person ("You can", "Use this to")
- Body: max 500 lines

`tests/test_lint_skills.py` covers all 12 rules with valid/invalid fixture pairs using `tmp_path`.

CI runs on push/PR when `skills/**`, `scripts/lint_skills.py`, or `tests/test_lint_skills.py` change.
