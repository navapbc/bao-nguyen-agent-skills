#!/usr/bin/env python3
"""Linter for Nava Skill SKILL.md files against Nava authoring standards."""

import re
import sys
from pathlib import Path

BANNED_NAMES = {"helper", "utils", "tools"}
NAME_RE = re.compile(r"^[a-z0-9-]+$")
MAX_NAME_LEN = 64
MAX_DESC_LEN = 250
MAX_TOTAL_LINES = 500
FIRST_PERSON_RE = re.compile(r"^(I |I'll |I'd |I've |I can |I will )", re.IGNORECASE)
SECOND_PERSON_RE = re.compile(r"^(You can |You'll |You'd |Use this to )", re.IGNORECASE)


def parse_frontmatter(content: str) -> tuple[dict[str, str], str | None]:
    """Return (fields_dict, error_message_or_None)."""
    lines = content.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}, "Missing YAML frontmatter (file must start with ---)"

    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        return {}, "Unclosed YAML frontmatter (missing closing ---)"

    fm_lines = lines[1:end_idx]
    fields: dict[str, str] = {}
    current_key: str | None = None
    current_value: list[str] = []

    for line in fm_lines:
        m = re.match(r"^(\w[\w-]*):\s*(.*)", line)
        if m:
            if current_key is not None:
                fields[current_key] = "\n".join(current_value).strip()
            current_key = m.group(1)
            current_value = [m.group(2)]
        elif current_key and (line.startswith("  ") or line.startswith("\t")):
            current_value.append(line.strip())

    if current_key is not None:
        fields[current_key] = "\n".join(current_value).strip()

    return fields, None


def lint_skill(skill_dir: Path) -> list[str]:
    """Return list of human-readable error strings for the skill at skill_dir."""
    errors: list[str] = []
    dir_name = skill_dir.name
    skill_file = skill_dir / "SKILL.md"

    # Rule 1: directory name format
    if not NAME_RE.match(dir_name):
        errors.append(
            f"{skill_dir}: directory name must contain only lowercase letters, "
            f"numbers, and hyphens (got: {dir_name!r})"
        )
    elif len(dir_name) > MAX_NAME_LEN:
        errors.append(
            f"{skill_dir}: directory name exceeds {MAX_NAME_LEN} characters "
            f"({len(dir_name)} chars)"
        )

    # Rule 2: banned names
    if dir_name in BANNED_NAMES:
        errors.append(
            f"{skill_dir}: directory name '{dir_name}' is too vague — "
            f"rename to something descriptive"
        )

    # Rule 3: SKILL.md exists
    if not skill_file.exists():
        errors.append(f"{skill_dir}: missing SKILL.md")
        return errors

    content = skill_file.read_text(encoding="utf-8")
    total_lines = len(content.splitlines())

    fields, fm_error = parse_frontmatter(content)
    if fm_error:
        errors.append(f"{skill_file}:1: {fm_error}")
        return errors

    # Rule 5: name field required
    if "name" not in fields:
        errors.append(f"{skill_file}: frontmatter missing required 'name' field")
    else:
        name = fields["name"]
        # Rule 7: name format
        if not NAME_RE.match(name):
            errors.append(
                f"{skill_file}: 'name' must contain only lowercase letters, "
                f"numbers, and hyphens (got: {name!r})"
            )
        elif len(name) > MAX_NAME_LEN:
            errors.append(
                f"{skill_file}: 'name' exceeds {MAX_NAME_LEN} characters ({len(name)} chars)"
            )
        # Rule 8: name matches directory
        if name != dir_name:
            errors.append(
                f"{skill_file}: 'name' ({name!r}) must match directory name ({dir_name!r})"
            )

    # Rule 6: description field required
    if "description" not in fields:
        errors.append(f"{skill_file}: frontmatter missing required 'description' field")
    else:
        desc = fields["description"]
        # Rule 9: description length
        if len(desc) > MAX_DESC_LEN:
            errors.append(
                f"{skill_file}: description exceeds {MAX_DESC_LEN} characters ({len(desc)} chars)"
            )
        # Rule 10: no first-person
        if FIRST_PERSON_RE.match(desc):
            errors.append(
                f"{skill_file}: description must be third-person "
                f"(starts with first-person pronoun: {desc[:30]!r})"
            )
        # Rule 11: no second-person
        if SECOND_PERSON_RE.match(desc):
            errors.append(
                f"{skill_file}: description must be third-person "
                f"(starts with second-person: {desc[:30]!r})"
            )

    # Rule 12: total line count
    if total_lines >= MAX_TOTAL_LINES:
        errors.append(
            f"{skill_file}: file exceeds {MAX_TOTAL_LINES} lines ({total_lines} lines) — "
            f"move reference material to separate files"
        )

    return errors


def main() -> int:
    skills_dir = Path("skills")
    if not skills_dir.is_dir():
        print("::error::skills/ directory not found. Run linter from repo root.", file=sys.stderr)
        return 1

    all_errors: list[str] = []
    skill_count = 0

    for skill_dir in sorted(skills_dir.iterdir()):
        if skill_dir.is_dir() and not skill_dir.name.startswith("."):
            skill_count += 1
            for error in lint_skill(skill_dir):
                all_errors.append(error)
                print(f"::error file={error.split(':')[0]}::{error}")

    if all_errors:
        print(f"\n{len(all_errors)} error(s) across {skill_count} skill(s). See above.")
        return 1

    print(f"✓ {skill_count} skill(s) passed linting.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
