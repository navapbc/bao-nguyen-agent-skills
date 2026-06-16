import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface ResolvedReference {
  /** Path exactly as written in the skill body. */
  path: string;
  /**
   * Whether the path resolves to an existing file on disk, relative to the
   * skill's directory. `existsSync` follows symlinks, so a symlinked
   * `references/foo.md` that points at a real file counts as existing.
   */
  exists: boolean;
}

// Skip absolute URLs (http:, mailto:, etc.), protocol-relative URLs, and pure anchors.
const NON_FILE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

// Markdown link/image targets: the `(target)` half of `[label](target)` or `![alt](target)`.
// Captures the target up to whitespace (which would start an optional title) or the closing paren.
const LINK_TARGET = /\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)|[^)]*))?\s*\)/g;

/**
 * Extract the relative file paths a skill body links to.
 *
 * Only markdown link/image targets are considered — that is how a skill points
 * at the resources it bundles (`[label](references/foo.md)`). Illustrative paths
 * that describe a generated app (e.g. `app/views/...`) appear as inline code, not
 * as links, so they are intentionally excluded and never reported as missing.
 */
export function extractReferencedPaths(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(LINK_TARGET)) {
    const target = m[1];
    if (!target) continue;
    let p = target.trim();
    const hash = p.indexOf("#");
    if (hash >= 0) p = p.slice(0, hash);
    if (!p || NON_FILE.test(p)) continue;
    found.add(p);
  }
  return [...found];
}

/**
 * Resolve every linked path against the skill's directory and record whether it
 * exists, following symlinks.
 */
export function resolveReferences(
  skillFilePath: string,
  body: string,
): ResolvedReference[] {
  const dir = dirname(skillFilePath);
  return extractReferencedPaths(body).map((path) => ({
    path,
    exists: existsSync(resolve(dir, path)),
  }));
}

/**
 * Render the resolution table that is injected into the eval prompt as the
 * authoritative source of truth for self-containedness.
 */
export function formatResolvedReferences(refs: ResolvedReference[]): string {
  if (refs.length === 0) {
    return "No relative file links were found in the skill body.";
  }
  return refs
    .map((r) => `- \`${r.path}\` → ${r.exists ? "EXISTS" : "MISSING"}`)
    .join("\n");
}
