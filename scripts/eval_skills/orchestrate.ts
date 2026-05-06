import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSiblingIndex,
  serializeSiblingIndex,
} from "./siblings.js";
import {
  cacheKey,
  readCache,
  writeCache,
  RUBRIC_VERSION,
} from "./cache.js";
import { deriveExitCode } from "./exit.js";
import type { SkillResult } from "./render.js";
import type { AgentResult } from "./schema.js";
import type { RunAgentOutput } from "./agent.js";

export interface OrchestrateDeps {
  changedPaths: string[];
  cacheDir: string;
  runAgent: (input: {
    skillPath: string;
    skillContent: string;
    siblingIndexJson: string;
    promptTemplate: string;
    repoRulesExcerpt: string;
    rubric: string;
  }) => Promise<RunAgentOutput>;
  promptTemplate: string;
  repoRulesExcerpt: string;
  rubric: string;
}

export interface OrchestrateOutput {
  results: SkillResult[];
  exitCode: 0 | 1;
}

const CONCURRENCY = 4;

async function pMapLimit<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function syntheticFailure(skillPath: string, reason: string): AgentResult {
  return {
    skill: skillPath,
    dimensions: {
      triggerability: { verdict: "fail", summary: reason },
      instructional_clarity: { verdict: "fail", summary: reason },
      self_containedness: { verdict: "fail", summary: reason },
      anti_patterns: { verdict: "fail", summary: reason },
    },
    findings: [
      {
        tier: "critical",
        dimension: "A",
        message: `agent evaluation failed: ${reason}`,
        recommendation: "Re-run the workflow; if persistent, check Cursor API status and rubric version.",
      },
    ],
    overall: "fail",
  };
}

export async function orchestrate(deps: OrchestrateDeps): Promise<OrchestrateOutput> {
  const skillsDir = join(process.cwd(), "skills");
  const allSiblings = buildSiblingIndex(skillsDir);

  const results: SkillResult[] = await pMapLimit(
    deps.changedPaths,
    CONCURRENCY,
    async (path) => {
      const absPath = join(process.cwd(), path);
      const skillContent = readFileSync(absPath, "utf8");
      const siblings = allSiblings.filter((s) => s.path !== absPath);
      const siblingIndexJson = serializeSiblingIndex(siblings);
      const key = cacheKey(skillContent, siblingIndexJson, RUBRIC_VERSION);

      const cached = readCache(deps.cacheDir, key);
      if (cached) return { path, result: cached };

      const out = await deps.runAgent({
        skillPath: path,
        skillContent,
        siblingIndexJson,
        promptTemplate: deps.promptTemplate,
        repoRulesExcerpt: deps.repoRulesExcerpt,
        rubric: deps.rubric,
      });

      const result = out.ok ? out.value : syntheticFailure(path, out.error);
      writeCache(deps.cacheDir, key, result);
      return { path, result };
    },
  );

  return { results, exitCode: deriveExitCode(results) };
}
