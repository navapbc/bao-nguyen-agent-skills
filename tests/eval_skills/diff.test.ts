import { describe, expect, it } from "vitest";
import { parseChangedSkills } from "../../scripts/eval_skills/diff.js";

describe("parseChangedSkills", () => {
  it("returns an empty array for empty input", () => {
    expect(parseChangedSkills("")).toEqual([]);
    expect(parseChangedSkills("\n")).toEqual([]);
  });

  it("returns one path for a single SKILL.md change", () => {
    const out = "skills/my-skill/SKILL.md\n";
    expect(parseChangedSkills(out)).toEqual(["skills/my-skill/SKILL.md"]);
  });

  it("returns multiple paths and trims whitespace", () => {
    const out = "skills/a/SKILL.md\nskills/b/SKILL.md\n";
    expect(parseChangedSkills(out)).toEqual([
      "skills/a/SKILL.md",
      "skills/b/SKILL.md",
    ]);
  });

  it("filters out non-SKILL.md lines defensively", () => {
    const out = [
      "skills/a/SKILL.md",
      "scripts/something.ts",
      "skills/b/README.md",
      "skills/c/SKILL.md",
    ].join("\n");
    expect(parseChangedSkills(out)).toEqual([
      "skills/a/SKILL.md",
      "skills/c/SKILL.md",
    ]);
  });

  it("deduplicates if git emits a path twice", () => {
    const out = "skills/a/SKILL.md\nskills/a/SKILL.md\n";
    expect(parseChangedSkills(out)).toEqual(["skills/a/SKILL.md"]);
  });
});
