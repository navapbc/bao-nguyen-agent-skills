import { z } from "zod";

export const Verdict = z.enum(["pass", "warn", "fail"]);
export const Tier = z.enum(["critical", "major", "minor"]);
export const Dimension = z.enum(["A", "B", "C", "D"]);

export const DimensionResult = z.object({
  verdict: Verdict,
  summary: z.string(),
});

export const Finding = z.object({
  tier: Tier,
  dimension: Dimension,
  line: z.number().int().positive().optional(),
  colliding_skill: z.string().optional(),
  message: z.string(),
  recommendation: z.string(),
});

export const AgentResult = z.object({
  skill: z.string(),
  dimensions: z.object({
    triggerability: DimensionResult,
    instructional_clarity: DimensionResult,
    self_containedness: DimensionResult,
    anti_patterns: DimensionResult,
  }),
  findings: z.array(Finding),
  overall: Verdict,
});

export type AgentResult = z.infer<typeof AgentResult>;
export type Finding = z.infer<typeof Finding>;
export type Tier = z.infer<typeof Tier>;
export type Dimension = z.infer<typeof Dimension>;

export type ValidationResult =
  | { ok: true; value: AgentResult }
  | { ok: false; error: string };

export function validateAgentResult(raw: unknown): ValidationResult {
  const parsed = AgentResult.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.message };
}
