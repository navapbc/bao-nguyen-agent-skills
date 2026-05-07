import { Agent, type RunResult } from "@cursor/sdk";
import { validateAgentResult } from "./schema.js";
import type { AgentResult } from "./schema.js";

export interface RunAgentInput {
  skillPath: string;
  skillContent: string;
  siblingIndexJson: string;
  promptTemplate: string;
  repoRulesExcerpt: string;
  rubric: string;
}

export type RunAgentOutput =
  | { ok: true; value: AgentResult }
  | { ok: false; error: string };

function substitute(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentOutput> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "CURSOR_API_KEY env var is not set" };
  }

  const prompt = substitute(input.promptTemplate, {
    SKILL_PATH: input.skillPath,
    SKILL_CONTENT: input.skillContent,
    SIBLING_INDEX: input.siblingIndexJson,
    REPO_RULES: input.repoRulesExcerpt,
    RUBRIC: input.rubric,
  });

  let res: RunResult;
  try {
    res = await Agent.prompt(prompt, {
      apiKey,
      model: { id: "composer-2" },
      local: { cwd: process.cwd() },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.status !== "finished") {
    return {
      ok: false,
      error: `agent run ended with status "${res.status}"`,
    };
  }
  if (!res.result) {
    return { ok: false, error: "agent returned no result" };
  }
  const raw = res.result;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: `agent returned non-JSON output: ${raw.slice(0, 200)}`,
    };
  }

  const v = validateAgentResult(parsed);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, value: v.value };
}
