import textwrap
from pathlib import Path
import pytest

from scripts.lint_skills import lint_skill


VALID_FRONTMATTER = textwrap.dedent("""\
    ---
    name: reviewing-code
    description: Reviews pull request code for correctness, style, and Nava standards. Use when opening a PR or requesting a code review.
    ---

    # Reviewing Code

    Body content here.
""")


@pytest.fixture
def skills_dir(tmp_path):
    d = tmp_path / "skills"
    d.mkdir()
    return d


def make_skill(skills_dir: Path, dir_name: str, content: str) -> Path:
    skill_dir = skills_dir / dir_name
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(content)
    return skill_dir


def test_valid_skill_passes(skills_dir):
    skill_dir = make_skill(skills_dir, "reviewing-code", VALID_FRONTMATTER)
    assert lint_skill(skill_dir) == []


# Rule 1: invalid directory name
def test_dir_name_uppercase_fails(skills_dir):
    skill_dir = skills_dir / "ReviewingCode"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(VALID_FRONTMATTER.replace("reviewing-code", "ReviewingCode"))
    errors = lint_skill(skill_dir)
    assert any("lowercase letters" in e for e in errors)


def test_dir_name_too_long_fails(skills_dir):
    long_name = "a" * 65
    skill_dir = skills_dir / long_name
    skill_dir.mkdir()
    content = VALID_FRONTMATTER.replace("reviewing-code", long_name)
    (skill_dir / "SKILL.md").write_text(content)
    errors = lint_skill(skill_dir)
    assert any("exceeds 64 characters" in e for e in errors)


# Rule 2: banned directory name
def test_banned_dir_name_fails(skills_dir):
    skill_dir = make_skill(
        skills_dir, "utils",
        VALID_FRONTMATTER.replace("reviewing-code", "utils")
    )
    errors = lint_skill(skill_dir)
    assert any("too vague" in e for e in errors)


# Rule 3: missing SKILL.md
def test_missing_skill_md_fails(skills_dir):
    skill_dir = skills_dir / "reviewing-code"
    skill_dir.mkdir()
    errors = lint_skill(skill_dir)
    assert any("missing SKILL.md" in e for e in errors)


# Rule 4: missing frontmatter
def test_missing_frontmatter_fails(skills_dir):
    skill_dir = make_skill(skills_dir, "reviewing-code", "# No frontmatter\n\nJust content.")
    errors = lint_skill(skill_dir)
    assert any("Missing YAML frontmatter" in e for e in errors)


def test_unclosed_frontmatter_fails(skills_dir):
    content = "---\nname: reviewing-code\ndescription: Foo.\n\n# Body\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("Unclosed" in e for e in errors)


# Rule 5: missing name field
def test_missing_name_field_fails(skills_dir):
    content = "---\ndescription: Reviews code for correctness.\n---\n\n# Body\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("missing required 'name'" in e for e in errors)


# Rule 6: missing description field
def test_missing_description_field_fails(skills_dir):
    content = "---\nname: reviewing-code\n---\n\n# Body\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("missing required 'description'" in e for e in errors)


# Rule 7: name format
def test_name_with_uppercase_fails(skills_dir):
    content = "---\nname: ReviewingCode\ndescription: Reviews code.\n---\n\n# Body\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("lowercase letters" in e for e in errors)


# Rule 8: name matches directory
def test_name_mismatch_fails(skills_dir):
    content = "---\nname: something-else\ndescription: Reviews code for correctness. Use when reviewing PRs.\n---\n\n# Body\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("must match directory name" in e for e in errors)


# Rule 9: description length
def test_description_too_long_fails(skills_dir):
    long_desc = "Reviews code. " * 20  # well over 250 chars
    content = f"---\nname: reviewing-code\ndescription: {long_desc}\n---\n\n# Body\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("description exceeds 250 characters" in e for e in errors)


# Rule 10: first-person description
def test_first_person_description_fails(skills_dir):
    content = "---\nname: reviewing-code\ndescription: I help you review code.\n---\n\n# Body\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("third-person" in e for e in errors)


# Rule 11: second-person description
def test_second_person_description_fails(skills_dir):
    content = "---\nname: reviewing-code\ndescription: You can use this to review code.\n---\n\n# Body\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("third-person" in e for e in errors)


# Rule 12: body too long
def test_body_too_long_fails(skills_dir):
    body_lines = "\n".join(f"Line {i}" for i in range(510))
    content = f"---\nname: reviewing-code\ndescription: Reviews code for correctness. Use when opening a PR.\n---\n\n{body_lines}\n"
    skill_dir = make_skill(skills_dir, "reviewing-code", content)
    errors = lint_skill(skill_dir)
    assert any("exceeds 500 lines" in e for e in errors)
