import type { SkillResult } from "./render.js";

export function deriveExitCode(results: SkillResult[]): 0 | 1 {
  for (const { result } of results) {
    for (const f of result.findings) {
      if (f.tier === "critical") return 1;
    }
  }
  return 0;
}
