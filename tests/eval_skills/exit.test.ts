import { describe, expect, it } from "vitest";
import { deriveExitCode } from "../../scripts/eval_skills/exit.js";
import type { AgentResult } from "../../scripts/eval_skills/schema.js";

function r(findings: AgentResult["findings"]): AgentResult {
  return {
    skill: "x",
    dimensions: {
      triggerability: { verdict: "pass", summary: "" },
      instructional_clarity: { verdict: "pass", summary: "" },
      self_containedness: { verdict: "pass", summary: "" },
      anti_patterns: { verdict: "pass", summary: "" },
    },
    findings,
    overall: "pass",
  };
}

describe("deriveExitCode", () => {
  it("returns 0 when there are no results", () => {
    expect(deriveExitCode([])).toBe(0);
  });

  it("returns 0 when all findings are minor", () => {
    expect(
      deriveExitCode([
        {
          path: "p",
          result: r([
            { tier: "minor", dimension: "D", message: "m", recommendation: "r" },
          ]),
        },
      ]),
    ).toBe(0);
  });

  it("returns 0 when findings are major but not critical", () => {
    expect(
      deriveExitCode([
        {
          path: "p",
          result: r([
            { tier: "major", dimension: "A", message: "m", recommendation: "r" },
          ]),
        },
      ]),
    ).toBe(0);
  });

  it("returns 1 when any finding is critical", () => {
    expect(
      deriveExitCode([
        {
          path: "p",
          result: r([
            { tier: "minor", dimension: "D", message: "m", recommendation: "r" },
            { tier: "critical", dimension: "B", message: "m", recommendation: "r" },
          ]),
        },
      ]),
    ).toBe(1);
  });
});
