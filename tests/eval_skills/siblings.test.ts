import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSiblingIndex,
  serializeSiblingIndex,
} from "../../scripts/eval_skills/siblings.js";

let root: string;

function writeSkill(name: string, description: string) {
  const dir = join(root, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nbody\n`,
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "skill-eval-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildSiblingIndex", () => {
  it("returns an empty array when no skills exist", () => {
    mkdirSync(join(root, "skills"), { recursive: true });
    expect(buildSiblingIndex(join(root, "skills"))).toEqual([]);
  });

  it("collects every skill in the directory", () => {
    writeSkill("alpha", "Alpha does X.");
    writeSkill("beta", "Beta does Y.");
    const idx = buildSiblingIndex(join(root, "skills"));
    expect(idx.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
  });

  it("excludes the skill at excludePath", () => {
    writeSkill("alpha", "A.");
    writeSkill("beta", "B.");
    const idx = buildSiblingIndex(
      join(root, "skills"),
      join(root, "skills", "alpha", "SKILL.md"),
    );
    expect(idx.map((s) => s.name)).toEqual(["beta"]);
  });

  it("skips directories without SKILL.md", () => {
    mkdirSync(join(root, "skills", "empty"), { recursive: true });
    writeSkill("alpha", "A.");
    const idx = buildSiblingIndex(join(root, "skills"));
    expect(idx.map((s) => s.name)).toEqual(["alpha"]);
  });

  it("skips skills whose frontmatter has invalid YAML", () => {
    mkdirSync(join(root, "skills", "broken"), { recursive: true });
    writeFileSync(
      join(root, "skills", "broken", "SKILL.md"),
      "---\nname: [unclosed bracket\ndescription: x\n---\n\nbody\n",
    );
    writeSkill("ok", "Fine.");
    const idx = buildSiblingIndex(join(root, "skills"));
    expect(idx.map((s) => s.name)).toEqual(["ok"]);
  });

  it("handles CRLF line endings in SKILL.md", () => {
    mkdirSync(join(root, "skills", "crlf"), { recursive: true });
    writeFileSync(
      join(root, "skills", "crlf", "SKILL.md"),
      "---\r\nname: crlf\r\ndescription: A skill with Windows line endings.\r\n---\r\n\r\nbody\r\n",
    );
    const idx = buildSiblingIndex(join(root, "skills"));
    expect(idx.map((s) => s.name)).toEqual(["crlf"]);
  });
});

describe("serializeSiblingIndex", () => {
  it("produces stable output regardless of input order", () => {
    const a = serializeSiblingIndex([
      { name: "b", description: "B.", path: "p2" },
      { name: "a", description: "A.", path: "p1" },
    ]);
    const b = serializeSiblingIndex([
      { name: "a", description: "A.", path: "p1" },
      { name: "b", description: "B.", path: "p2" },
    ]);
    expect(a).toBe(b);
  });

  it("changes when a description changes", () => {
    const a = serializeSiblingIndex([
      { name: "x", description: "old", path: "p" },
    ]);
    const b = serializeSiblingIndex([
      { name: "x", description: "new", path: "p" },
    ]);
    expect(a).not.toBe(b);
  });

  it("omits the path field from serialization", () => {
    const s = serializeSiblingIndex([
      { name: "x", description: "d", path: "should-not-appear" },
    ]);
    expect(s).not.toContain("should-not-appear");
  });
});
