import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orchestrate } from "../../scripts/eval_skills/orchestrate.js";
import type { AgentResult } from "../../scripts/eval_skills/schema.js";

let root: string;
let originalCwd: string;

function passResult(name: string): AgentResult {
  return {
    skill: name,
    dimensions: {
      triggerability: { verdict: "pass", summary: "" },
      instructional_clarity: { verdict: "pass", summary: "" },
      self_containedness: { verdict: "pass", summary: "" },
      anti_patterns: { verdict: "pass", summary: "" },
    },
    findings: [],
    overall: "pass",
  };
}

function critResult(name: string, colliding?: string): AgentResult {
  return {
    skill: name,
    dimensions: {
      triggerability: { verdict: "fail", summary: "collides" },
      instructional_clarity: { verdict: "pass", summary: "" },
      self_containedness: { verdict: "pass", summary: "" },
      anti_patterns: { verdict: "pass", summary: "" },
    },
    findings: [
      {
        tier: "critical",
        dimension: "A",
        ...(colliding ? { colliding_skill: colliding } : {}),
        message: "collision",
        recommendation: "narrow",
      },
    ],
    overall: "fail",
  };
}

function makeSkill(name: string, description: string) {
  const dir = join(root, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nbody\n`,
  );
  return join("skills", name, "SKILL.md");
}

beforeEach(() => {
  originalCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), "orch-"));
  process.chdir(root);
  mkdirSync(join(root, ".cache", "skill-eval"), { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
});

describe("orchestrate", () => {
  it("returns exit 0 when no skills changed", async () => {
    const agent = vi.fn();
    const out = await orchestrate({
      changedPaths: [],
      cacheDir: join(root, ".cache", "skill-eval"),
      runAgent: agent,
      promptTemplate: "x",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(out.exitCode).toBe(0);
    expect(out.results).toEqual([]);
    expect(agent).not.toHaveBeenCalled();
  });

  it("calls the agent on a cache miss, writes the result, and returns exit 0 on pass", async () => {
    makeSkill("alpha", "Alpha description.");
    const path = makeSkill("beta", "Beta description.");
    const agent = vi.fn().mockResolvedValue({ ok: true, value: passResult("beta") });
    const out = await orchestrate({
      changedPaths: [path],
      cacheDir: join(root, ".cache", "skill-eval"),
      runAgent: agent,
      promptTemplate: "x",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(agent).toHaveBeenCalledTimes(1);
    expect(out.exitCode).toBe(0);
    expect(out.results).toHaveLength(1);
  });

  it("skips the agent on a cache hit", async () => {
    const path = makeSkill("alpha", "Alpha description.");
    const agent = vi.fn().mockResolvedValue({ ok: true, value: passResult("alpha") });

    // first run: miss
    await orchestrate({
      changedPaths: [path],
      cacheDir: join(root, ".cache", "skill-eval"),
      runAgent: agent,
      promptTemplate: "x",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(agent).toHaveBeenCalledTimes(1);

    // second run with no changes: hit
    await orchestrate({
      changedPaths: [path],
      cacheDir: join(root, ".cache", "skill-eval"),
      runAgent: agent,
      promptTemplate: "x",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(agent).toHaveBeenCalledTimes(1);
  });

  it("returns exit 1 when any finding is critical", async () => {
    const path = makeSkill("a", "A.");
    makeSkill("b", "B.");
    const agent = vi
      .fn()
      .mockResolvedValue({ ok: true, value: critResult("a", "b") });
    const out = await orchestrate({
      changedPaths: [path],
      cacheDir: join(root, ".cache", "skill-eval"),
      runAgent: agent,
      promptTemplate: "x",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(out.exitCode).toBe(1);
  });

  it("synthesizes a critical finding when the agent returns ok:false", async () => {
    const path = makeSkill("a", "A.");
    const agent = vi.fn().mockResolvedValue({ ok: false, error: "schema invalid" });
    const out = await orchestrate({
      changedPaths: [path],
      cacheDir: join(root, ".cache", "skill-eval"),
      runAgent: agent,
      promptTemplate: "x",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(out.exitCode).toBe(1);
    expect(out.results[0]?.result.findings[0]?.tier).toBe("critical");
  });
});
