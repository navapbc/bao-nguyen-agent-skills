import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface Sibling {
  name: string;
  description: string;
  path: string;
}

interface Frontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};
  const block = content.slice(4, end);
  try {
    const obj = yaml.load(block);
    if (obj && typeof obj === "object") return obj as Frontmatter;
  } catch {
    /* ignore — caller treats missing fields as empty */
  }
  return {};
}

export function buildSiblingIndex(
  skillsDir: string,
  excludePath?: string,
): Sibling[] {
  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return [];
  }
  const out: Sibling[] = [];
  for (const entry of entries) {
    const dir = join(skillsDir, entry);
    let st;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const skillPath = join(dir, "SKILL.md");
    if (skillPath === excludePath) continue;
    let content: string;
    try {
      content = readFileSync(skillPath, "utf8");
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    if (!fm.name || !fm.description) continue;
    out.push({ name: fm.name, description: fm.description, path: skillPath });
  }
  return out;
}

export function serializeSiblingIndex(siblings: Sibling[]): string {
  const sorted = [...siblings].sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(
    sorted.map((s) => ({ name: s.name, description: s.description })),
  );
}
