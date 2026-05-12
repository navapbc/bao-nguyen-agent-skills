import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AgentResult } from "./schema.js";
import { validateAgentResult } from "./schema.js";

export const RUBRIC_VERSION = "1";

export function cacheKey(
  skillContent: string,
  serializedSiblings: string,
  rubricVersion: string,
): string {
  const h = createHash("sha256");
  h.update(skillContent);
  h.update("\n--SIBLINGS--\n");
  h.update(serializedSiblings);
  h.update("\n--RUBRIC--\n");
  h.update(rubricVersion);
  return h.digest("hex");
}

export function readCache(dir: string, key: string): AgentResult | null {
  const path = join(dir, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const validated = validateAgentResult(parsed);
    return validated.ok ? validated.value : null;
  } catch {
    return null;
  }
}

export function writeCache(
  dir: string,
  key: string,
  result: AgentResult,
): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${key}.json`), JSON.stringify(result, null, 2));
}
