import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractReferencedPaths,
  resolveReferences,
  formatResolvedReferences,
} from "../../scripts/eval_skills/references.js";

describe("extractReferencedPaths", () => {
  it("extracts markdown link and image targets", () => {
    const body =
      "See [the schema](references/model-spec-schema.md) and ![diagram](references/img/flow.png).";
    expect(extractReferencedPaths(body)).toEqual([
      "references/model-spec-schema.md",
      "references/img/flow.png",
    ]);
  });

  it("ignores URLs, mailto, and bare anchors", () => {
    const body =
      "[site](https://example.com) [mail](mailto:a@b.com) [top](#section) [proto](//cdn.example.com/x.js)";
    expect(extractReferencedPaths(body)).toEqual([]);
  });

  it("strips trailing anchors from file links", () => {
    const body = "[helper](references/ui-kit.md#application-layout)";
    expect(extractReferencedPaths(body)).toEqual(["references/ui-kit.md"]);
  });

  it("ignores inline-code paths that are not links (e.g. generated-app paths)", () => {
    const body =
      "Create `app/views/layouts/application.html.erb` then read [TDD](references/test-driven-development.md).";
    expect(extractReferencedPaths(body)).toEqual([
      "references/test-driven-development.md",
    ]);
  });

  it("dedupes repeated targets", () => {
    const body = "[a](references/x.md) and again [b](references/x.md)";
    expect(extractReferencedPaths(body)).toEqual(["references/x.md"]);
  });
});

describe("resolveReferences", () => {
  let root: string;
  let skillDir: string;
  let skillFile: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "refs-"));
    mkdirSync(join(root, "references"), { recursive: true });
    writeFileSync(join(root, "references", "shared.md"), "shared");
    skillDir = join(root, "skills", "demo");
    mkdirSync(join(skillDir, "references"), { recursive: true });
    skillFile = join(skillDir, "SKILL.md");
    // a real local reference
    writeFileSync(join(skillDir, "references", "local.md"), "local");
    // a symlink pointing at the repo-root reference (the pattern that tripped the bot)
    symlinkSync(
      "../../../references/shared.md",
      join(skillDir, "references", "shared.md"),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("marks a real local reference as existing", () => {
    const refs = resolveReferences(skillFile, "[x](references/local.md)");
    expect(refs).toEqual([{ path: "references/local.md", exists: true }]);
  });

  it("follows symlinks — a resolvable symlink counts as existing", () => {
    const refs = resolveReferences(skillFile, "[x](references/shared.md)");
    expect(refs).toEqual([{ path: "references/shared.md", exists: true }]);
  });

  it("marks a nonexistent path as missing", () => {
    const refs = resolveReferences(skillFile, "[x](references/nope.md)");
    expect(refs).toEqual([{ path: "references/nope.md", exists: false }]);
  });
});

describe("formatResolvedReferences", () => {
  it("renders an EXISTS/MISSING bullet per reference", () => {
    const out = formatResolvedReferences([
      { path: "references/a.md", exists: true },
      { path: "references/b.md", exists: false },
    ]);
    expect(out).toBe(
      "- `references/a.md` → EXISTS\n- `references/b.md` → MISSING",
    );
  });

  it("reports when no links were found", () => {
    expect(formatResolvedReferences([])).toBe(
      "No relative file links were found in the skill body.",
    );
  });
});
