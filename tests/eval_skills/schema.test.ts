import { describe, expect, it } from "vitest";
import { validateAgentResult } from "../../scripts/eval_skills/schema.js";

const validResult = {
  skill: "my-skill",
  dimensions: {
    triggerability: { verdict: "pass", summary: "ok" },
    instructional_clarity: { verdict: "pass", summary: "ok" },
    self_containedness: { verdict: "pass", summary: "ok" },
    anti_patterns: { verdict: "pass", summary: "ok" },
  },
  findings: [],
  overall: "pass",
};

describe("validateAgentResult", () => {
  it("accepts a well-formed result", () => {
    const r = validateAgentResult(validResult);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.skill).toBe("my-skill");
  });

  it("accepts a finding with collision metadata", () => {
    const r = validateAgentResult({
      ...validResult,
      findings: [
        {
          tier: "critical",
          dimension: "A",
          line: 3,
          colliding_skill: "other-skill",
          message: "overlaps",
          recommendation: "narrow scope",
        },
      ],
      overall: "fail",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown verdict", () => {
    const bad = structuredClone(validResult);
    (bad.dimensions.triggerability as any).verdict = "maybe";
    const r = validateAgentResult(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown tier", () => {
    const bad = {
      ...validResult,
      findings: [
        { tier: "blocker", dimension: "A", message: "x", recommendation: "y" },
      ],
    };
    const r = validateAgentResult(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects a missing dimension", () => {
    const bad: any = { ...validResult, dimensions: { ...validResult.dimensions } };
    delete bad.dimensions.anti_patterns;
    const r = validateAgentResult(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects non-JSON input", () => {
    const r = validateAgentResult("not-an-object" as unknown as object);
    expect(r.ok).toBe(false);
  });
});
