import type { AgentResult, Finding } from "./schema.js";

export interface SkillResult {
  path: string;
  result: AgentResult;
}

function formatMessage(f: Finding): string {
  let msg = `[${f.dimension}] ${f.message}`;
  if (f.colliding_skill) {
    msg += ` (collides with '${f.colliding_skill}')`;
  }
  return msg;
}

export function renderAnnotations(results: SkillResult[]): string[] {
  const out: string[] = [];
  for (const { path, result } of results) {
    for (const f of result.findings) {
      if (f.tier === "minor") continue;
      const level = f.tier === "critical" ? "error" : "warning";
      const loc = f.line ? `file=${path},line=${f.line}` : `file=${path}`;
      out.push(`::${level} ${loc}::${formatMessage(f)}`);
    }
  }
  return out;
}
