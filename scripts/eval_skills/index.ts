#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseChangedSkills } from "./diff.js";
import { orchestrate } from "./orchestrate.js";
import { renderAnnotations, renderComment } from "./render.js";
import { runAgent } from "./agent.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : fallback;
}

async function main() {
  const baseRef = arg("--base-ref", "origin/main");
  const cacheDir = arg("--cache-dir", join(process.cwd(), ".cache", "skill-eval"));
  const commentFile = arg(
    "--comment-file",
    join(process.cwd(), "skill-eval-comment.md"),
  );

  const diff = execFileSync(
    "git",
    ["diff", "--name-only", `${baseRef}...HEAD`, "--", "skills/*/SKILL.md"],
    { encoding: "utf8" },
  );
  const changedPaths = parseChangedSkills(diff);

  const promptTemplate = readFileSync(
    join(process.cwd(), "scripts", "skill_eval_prompt.md"),
    "utf8",
  );
  const rubric = readFileSync(
    join(process.cwd(), "docs", "skill-quality-rubric.md"),
    "utf8",
  );
  const claudeMd = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8");

  const { results, exitCode } = await orchestrate({
    changedPaths,
    cacheDir,
    runAgent,
    promptTemplate,
    repoRulesExcerpt: claudeMd,
    rubric,
  });

  for (const line of renderAnnotations(results)) {
    process.stdout.write(`${line}\n`);
  }

  writeFileSync(commentFile, renderComment(results));

  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`skill-eval failed: ${err}\n`);
  process.exit(1);
});
