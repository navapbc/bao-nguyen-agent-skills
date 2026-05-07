import { Agent, Cursor, type RunResult } from "@cursor/sdk";
import { validateAgentResult } from "./schema.js";
import type { AgentResult } from "./schema.js";
import { log, logError } from "./log.js";

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

  try {
    const me = await Cursor.me({ apiKey });
    log(`key validated: apiKeyName=${me.apiKeyName}`);
  } catch (err) {
    const name = err instanceof Error ? err.name : "non-Error";
    const msg = err instanceof Error ? err.message || "(empty message)" : String(err);
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      process.stderr.write(
        `[skill-eval] preflight key validation failed: status=${e.status} code=${e.code} endpoint=${e.endpoint} requestId=${e.requestId}\n`
      );
    }
    return { ok: false, error: `API key validation failed — ${name}: ${msg}` };
  }

  let res: RunResult;
  try {
    res = await Agent.prompt(prompt, {
      apiKey,
      model: { id: "gemini-3-flash" },
    });
  } catch (err) {
    logError(`agent SDK call failed for ${input.skillPath}`, err);
    const name = err instanceof Error ? err.name : "non-Error";
    const msg =
      err instanceof Error
        ? err.message || "(empty message)"
        : String(err);
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      process.stderr.write(
        `[skill-eval] error details: status=${e.status} code=${e.code} endpoint=${e.endpoint} requestId=${e.requestId}\n`
      );
    }
    return { ok: false, error: `SDK threw ${name}: ${msg}` };
  }

  log(
    `[${input.skillPath}] agent finished status=${res.status} resultLen=${res.result?.length ?? 0}`,
  );

  if (res.status !== "finished") {
    const preview = res.result ? `; result preview: ${res.result.slice(0, 200)}` : "";
    return {
      ok: false,
      error: `agent run ended with status "${res.status}"${preview}`,
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
    process.stderr.write(
      `[skill-eval] non-JSON agent output for ${input.skillPath} (raw, truncated to 2000 chars):\n${raw.slice(0, 2000)}\n`,
    );
    return {
      ok: false,
      error: `agent returned non-JSON output: ${raw.slice(0, 200)}`,
    };
  }

  const v = validateAgentResult(parsed);
  if (!v.ok) {
    process.stderr.write(
      `[skill-eval] schema validation failed for ${input.skillPath}; parsed object (truncated to 2000 chars):\n${JSON.stringify(parsed, null, 2).slice(0, 2000)}\n`,
    );
    return { ok: false, error: v.error };
  }
  return { ok: true, value: v.value };
}
