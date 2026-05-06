import { describe, expect, it, vi } from "vitest";

vi.mock("@cursor/sdk", () => ({
  Agent: {
    prompt: vi.fn().mockResolvedValue({
      id: "run-1",
      status: "finished",
      result:
        '{"skill":"x","dimensions":{"triggerability":{"verdict":"pass","summary":""},"instructional_clarity":{"verdict":"pass","summary":""},"self_containedness":{"verdict":"pass","summary":""},"anti_patterns":{"verdict":"pass","summary":""}},"findings":[],"overall":"pass"}',
    }),
  },
}));

import { runAgent } from "../../scripts/eval_skills/agent.js";

describe("runAgent", () => {
  it("returns a validated AgentResult on a successful call", async () => {
    const r = await runAgent({
      skillPath: "skills/x/SKILL.md",
      skillContent: "---\nname: x\ndescription: Y\n---\nbody",
      siblingIndexJson: "[]",
      promptTemplate: "{{SKILL_CONTENT}} | {{SIBLING_INDEX}}",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.skill).toBe("x");
  });

  it("returns ok:false when the agent output fails schema validation", async () => {
    const sdk = await import("@cursor/sdk");
    vi.mocked(sdk.Agent.prompt).mockResolvedValueOnce({
      id: "run-2",
      status: "finished",
      result: "{not: valid}",
    });
    const r = await runAgent({
      skillPath: "skills/x/SKILL.md",
      skillContent: "x",
      siblingIndexJson: "[]",
      promptTemplate: "x",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(r.ok).toBe(false);
  });

  it("returns ok:false when the SDK throws", async () => {
    const sdk = await import("@cursor/sdk");
    vi.mocked(sdk.Agent.prompt).mockRejectedValueOnce(new Error("api down"));
    const r = await runAgent({
      skillPath: "skills/x/SKILL.md",
      skillContent: "x",
      siblingIndexJson: "[]",
      promptTemplate: "x",
      repoRulesExcerpt: "",
      rubric: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("api down");
  });
});
