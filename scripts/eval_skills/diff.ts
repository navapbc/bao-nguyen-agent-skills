const SKILL_PATH_RE = /^skills\/[^/]+\/SKILL\.md$/;

export function parseChangedSkills(diffOutput: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of diffOutput.split("\n")) {
    const path = line.trim();
    if (!SKILL_PATH_RE.test(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}
