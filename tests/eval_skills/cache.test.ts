import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cacheKey,
  readCache,
  writeCache,
  RUBRIC_VERSION,
} from "../../scripts/eval_skills/cache.js";
import type { AgentResult } from "../../scripts/eval_skills/schema.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "skill-cache-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sampleResult: AgentResult = {
  skill: "x",
  dimensions: {
    triggerability: { verdict: "pass", summary: "ok" },
    instructional_clarity: { verdict: "pass", summary: "ok" },
    self_containedness: { verdict: "pass", summary: "ok" },
    anti_patterns: { verdict: "pass", summary: "ok" },
  },
  findings: [],
  overall: "pass",
};

describe("cacheKey", () => {
  it("is deterministic for identical inputs", () => {
    const a = cacheKey("content", "siblings", RUBRIC_VERSION);
    const b = cacheKey("content", "siblings", RUBRIC_VERSION);
    expect(a).toBe(b);
  });

  it("changes when skill content changes", () => {
    const a = cacheKey("c1", "s", RUBRIC_VERSION);
    const b = cacheKey("c2", "s", RUBRIC_VERSION);
    expect(a).not.toBe(b);
  });

  it("changes when sibling index changes", () => {
    const a = cacheKey("c", "s1", RUBRIC_VERSION);
    const b = cacheKey("c", "s2", RUBRIC_VERSION);
    expect(a).not.toBe(b);
  });

  it("changes when rubric version changes", () => {
    const a = cacheKey("c", "s", "1");
    const b = cacheKey("c", "s", "2");
    expect(a).not.toBe(b);
  });

  it("returns a 64-char hex string", () => {
    expect(cacheKey("c", "s", "v")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("read/writeCache", () => {
  it("returns null on miss", () => {
    expect(readCache(dir, "nonexistent")).toBeNull();
  });

  it("round-trips a result", () => {
    writeCache(dir, "abc", sampleResult);
    expect(readCache(dir, "abc")).toEqual(sampleResult);
  });

  it("returns null on corrupt JSON", () => {
    writeCache(dir, "abc", sampleResult);
    writeFileSync(join(dir, "abc.json"), "not json");
    expect(readCache(dir, "abc")).toBeNull();
  });
});
