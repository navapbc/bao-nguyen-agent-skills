import { describe, expect, it } from "vitest";
import { renderAnnotations } from "../../scripts/eval_skills/render.js";
import type { AgentResult } from "../../scripts/eval_skills/schema.js";

function makeResult(findings: AgentResult["findings"]): AgentResult {
  return {
    skill: "demo",
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

describe("renderAnnotations", () => {
  it("emits ::error for critical findings", () => {
    const lines = renderAnnotations([
      {
        path: "skills/demo/SKILL.md",
        result: makeResult([
          {
            tier: "critical",
            dimension: "B",
            line: 12,
            message: "placeholder TODO present",
            recommendation: "remove it",
          },
        ]),
      },
    ]);
    expect(lines).toEqual([
      "::error file=skills/demo/SKILL.md,line=12::[B] placeholder TODO present",
    ]);
  });

  it("emits ::warning for major findings", () => {
    const lines = renderAnnotations([
      {
        path: "skills/demo/SKILL.md",
        result: makeResult([
          {
            tier: "major",
            dimension: "A",
            message: "description vague",
            recommendation: "add domain noun",
          },
        ]),
      },
    ]);
    expect(lines).toEqual([
      "::warning file=skills/demo/SKILL.md::[A] description vague",
    ]);
  });

  it("emits nothing for minor findings", () => {
    const lines = renderAnnotations([
      {
        path: "skills/demo/SKILL.md",
        result: makeResult([
          {
            tier: "minor",
            dimension: "D",
            message: "filler word present",
            recommendation: "drop it",
          },
        ]),
      },
    ]);
    expect(lines).toEqual([]);
  });

  it("includes colliding_skill in the annotation message", () => {
    const lines = renderAnnotations([
      {
        path: "skills/a/SKILL.md",
        result: makeResult([
          {
            tier: "critical",
            dimension: "A",
            colliding_skill: "b",
            message: "overlaps trigger phrase",
            recommendation: "narrow",
          },
        ]),
      },
    ]);
    expect(lines[0]).toContain("collides with 'b'");
  });

  it("escapes newlines and percent signs in messages", () => {
    const lines = renderAnnotations([
      {
        path: "skills/demo/SKILL.md",
        result: makeResult([
          {
            tier: "critical",
            dimension: "B",
            message: "line one\nline two %50",
            recommendation: "fix",
          },
        ]),
      },
    ]);
    expect(lines[0]).toBe(
      "::error file=skills/demo/SKILL.md::[B] line one%0Aline two %2550",
    );
  });

  it("omits line= when line is absent", () => {
    const lines = renderAnnotations([
      {
        path: "skills/demo/SKILL.md",
        result: makeResult([
          {
            tier: "critical",
            dimension: "C",
            message: "missing reference",
            recommendation: "add file",
          },
        ]),
      },
    ]);
    expect(lines[0]).toBe(
      "::error file=skills/demo/SKILL.md::[C] missing reference",
    );
  });
});

import { renderComment } from "../../scripts/eval_skills/render.js";

describe("renderComment", () => {
  it("starts with the sticky marker", () => {
    const out = renderComment([]);
    expect(out.startsWith("<!-- skill-eval-bot -->")).toBe(true);
  });

  it("reports zero skills evaluated when input is empty", () => {
    const out = renderComment([]);
    expect(out).toContain("0 skills evaluated");
  });

  it("counts pass/warn/critical correctly", () => {
    const out = renderComment([
      {
        path: "skills/a/SKILL.md",
        result: makeResult([]),
      },
      {
        path: "skills/b/SKILL.md",
        result: {
          ...makeResult([
            {
              tier: "major",
              dimension: "A",
              message: "vague",
              recommendation: "fix",
            },
          ]),
          overall: "warn",
        },
      },
      {
        path: "skills/c/SKILL.md",
        result: {
          ...makeResult([
            {
              tier: "critical",
              dimension: "B",
              message: "placeholder",
              recommendation: "remove",
            },
          ]),
          overall: "fail",
        },
      },
    ]);
    expect(out).toContain("3 skills evaluated");
    expect(out).toContain("1 passed");
    expect(out).toContain("1 warning");
    expect(out).toContain("1 critical");
  });

  it("groups collision findings under dimension A with the colliding skill name", () => {
    const out = renderComment([
      {
        path: "skills/x/SKILL.md",
        result: {
          ...makeResult([
            {
              tier: "critical",
              dimension: "A",
              colliding_skill: "y",
              message: "shared trigger phrase",
              recommendation: "narrow",
            },
          ]),
          overall: "fail",
        },
      },
    ]);
    expect(out).toContain("Triggerability");
    expect(out).toContain("collides with **y**");
  });
});
