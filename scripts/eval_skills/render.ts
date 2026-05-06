import type { AgentResult, Finding } from "./schema.js";

export interface SkillResult {
  path: string;
  result: AgentResult;
}

function escapeAnnotationValue(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function formatMessage(f: Finding): string {
  let msg = `[${f.dimension}] ${escapeAnnotationValue(f.message)}`;
  if (f.colliding_skill) {
    msg += ` (collides with '${escapeAnnotationValue(f.colliding_skill)}')`;
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

const COMMENT_MARKER = "<!-- skill-eval-bot -->";

const DIMENSION_LABEL: Record<string, string> = {
  A: "Triggerability",
  B: "Instructional clarity",
  C: "Self-containedness",
  D: "Anti-patterns",
};

function classifyResult(r: AgentResult): "pass" | "warn" | "critical" {
  if (r.findings.some((f) => f.tier === "critical")) return "critical";
  if (r.findings.some((f) => f.tier === "major")) return "warn";
  return "pass";
}

function renderFinding(f: Finding): string {
  const lineSuffix = f.line ? ` (line ${f.line})` : "";
  const collision = f.colliding_skill
    ? ` — collides with **${f.colliding_skill}**`
    : "";
  return `- **${f.tier}**${lineSuffix}${collision}: ${f.message}\n  - _Recommendation:_ ${f.recommendation}`;
}

function renderSkillSection(sr: SkillResult): string {
  const { path, result } = sr;
  const lines: string[] = [];
  lines.push(`### \`${path}\` — ${result.overall.toUpperCase()}`);
  lines.push("");
  lines.push("| Dimension | Verdict | Summary |");
  lines.push("|-----------|---------|---------|");
  for (const [key, label] of [
    ["triggerability", DIMENSION_LABEL.A],
    ["instructional_clarity", DIMENSION_LABEL.B],
    ["self_containedness", DIMENSION_LABEL.C],
    ["anti_patterns", DIMENSION_LABEL.D],
  ] as const) {
    const d = result.dimensions[key];
    lines.push(`| ${label} | ${d.verdict} | ${d.summary} |`);
  }
  if (result.findings.length > 0) {
    lines.push("");
    lines.push("**Findings:**");
    for (const dim of ["A", "B", "C", "D"] as const) {
      const group = result.findings.filter((f) => f.dimension === dim);
      if (group.length === 0) continue;
      lines.push(`- _${DIMENSION_LABEL[dim]}_`);
      for (const f of group) lines.push(`  ${renderFinding(f)}`);
    }
  }
  return lines.join("\n");
}

export function renderComment(results: SkillResult[]): string {
  let pass = 0;
  let warn = 0;
  let critical = 0;
  for (const r of results) {
    const c = classifyResult(r.result);
    if (c === "pass") pass++;
    else if (c === "warn") warn++;
    else critical++;
  }
  const summary = `${results.length} skills evaluated — ${pass} passed, ${warn} warning, ${critical} critical.`;
  const sections = results.map(renderSkillSection).join("\n\n");
  return `${COMMENT_MARKER}\n\n## Skill quality check\n\n${summary}\n\n${sections}\n`;
}
