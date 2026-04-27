# Skill Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only `make analyze-skill SKILL=<name>` command that measures a skill's effect on a Claude run by comparing two **Anthropic Managed Agents** sessions (with the skill's content in the system prompt, without it) and emits a markdown comparison report under `evals/`.

**Architecture:** A Python script `scripts/analyze_skill.py` orchestrates two Anthropic Managed Agents sessions via the official `anthropic` Python SDK (`client.beta.agents`, `client.beta.environments`, `client.beta.sessions`). Each session runs in an Anthropic-hosted cloud sandbox VM — full `bash`/`edit`/`write`/network — so the agent can run skills that install software without putting the dev's host at risk. One session sets `system` to a base prompt **plus** the target skill's `SKILL.md` body ("with skill"); the other uses only the base prompt ("without skill"). Both consume the same user-message prompt loaded from `skills/<name>/eval-task.md`. The script counts turns from the streamed event log, measures wall-clock duration, computes session-runtime cost (`duration × $0.08/hr`), and renders a markdown table under `evals/<skill>/report-<timestamp>.md`. Per-run output (event log, agent/environment/session IDs) lands in `evals/<skill>/<variant>/<timestamp>/`.

**Tech Stack:** Python 3.11+ (`argparse`, `json`, `pathlib`, `dataclasses`, `datetime`, `time`, `os`), `anthropic>=0.40.0` Python SDK with the `managed-agents-2026-04-01` beta header, `pytest` with `unittest.mock` for SDK mocking, GNU Make as the entrypoint.

---

## Design Notes

**Why Managed Agents (not local `claude -p`):** The original draft of this plan shelled out to the local `claude` CLI with `--dangerously-skip-permissions`. That permission flag, combined with skills like `build-strata-rails-app` that install Docker and clone software, is an unacceptable risk on the dev's machine. Managed Agents runs each session in a disposable Anthropic-hosted container with full bash/edit/write/network — the agent can do whatever the skill says without touching the dev's host. The cost is API-key billing (no Claude Pro/Max subscription path exists for programmatic headless runs as of 2026-04-27 — confirmed via Anthropic docs) and a more elaborate three-step API lifecycle (create agent → create environment → create session → send user event → stream events to completion).

**Why per-variant agent + per-variant environment:** A Managed Agents `agent` is bound to a single `system` prompt. We need two distinct system prompts (with-skill and without-skill), so we create two `agent` objects per analyzer run. Environments are cheap to create and we tear them down at the end of each run, so we create one environment per variant for symmetry and clean isolation between runs.

**Why a sidecar `eval-task.md`:** The trigger phrase ("scaffold a strata rails app", "print hello world in 10 languages") is per-skill and not derivable from the skill body. A sidecar file keeps it next to the skill, version-controlled, and out of the SKILL.md frontmatter (which the linter constrains).

**Token metrics are intentionally NOT collected.** As of 2026-04-27 the Managed Agents API does **not** return per-session token usage in either the session resource or the event stream. The report therefore compares **turns**, **wall-clock duration**, and **runtime cost** (`duration × $0.08/hr` — the Managed Agents session-runtime price). Token costs must be reconciled separately via the org's Anthropic console billing dashboard. The README documents this caveat. If/when the API exposes usage, a follow-up task can add token columns without disturbing the rest of the pipeline.

**Timeout enforcement replaces `--max-budget-usd`.** Managed Agents has no per-request budget cap. Instead, the analyzer enforces a hard client-side timeout: if a session does not reach `session.status_idle` within `--timeout` seconds, the script calls the session terminate endpoint and records the run as errored. This bounds runtime cost (`timeout_seconds / 3600 × $0.08`) but **does not bound token cost**. Devs running expensive skills should monitor the billing dashboard.

**Skill-tool fidelity gap:** Real skill loading happens via the Skill tool, which inserts `SKILL.md` content into context on demand. Putting the same content into the agent's `system` prompt is a close approximation: same tokens enter context, but they enter eagerly rather than lazily. For analyzer purposes (turn count + duration comparison), the approximation is acceptable. The README documents this limitation.

---

## File Structure

**Created:**
- `Makefile` — root-level entry point; defines `analyze-skill`, `lint`, `test` targets.
- `scripts/analyze_skill.py` — single-file orchestrator (~330 lines).
- `tests/test_analyze_skill.py` — pytest unit tests for pure functions; SDK calls mocked.
- `evals/.gitignore` — `*` to ignore everything inside, with `!.gitignore` to keep the dir tracked.
- `skills/build-strata-rails-app/eval-task.md` — sidecar prompt.
- `skills/hello-world/eval-task.md` — sidecar prompt (used for cheap end-to-end smoke test).
- `requirements-dev.txt` — pins `anthropic` and `pytest`.

**Modified:**
- `.gitignore` — append a single `evals/` line (defense in depth alongside `evals/.gitignore`).
- `README.md` — document `make analyze-skill` usage, costs, limitations.
- `CLAUDE.md` — add commands section entry for the new make target.

**Untouched:**
- `scripts/lint_skills.py`, `tests/test_lint_skills.py`, `.github/workflows/lint-skills.yml` — analyzer is local-only and does not run in CI.

---

## Task 1: Repo plumbing — gitignore, evals dir, sidecar task files

**Files:**
- Modify: `.gitignore` (append one line)
- Create: `evals/.gitignore`
- Create: `skills/hello-world/eval-task.md`
- Create: `skills/build-strata-rails-app/eval-task.md`

- [ ] **Step 1: Append `evals/` to root `.gitignore`**

Open `.gitignore` and append at the very end:

```
# Skill analyzer eval workdirs (local-only, never committed)
evals/
```

- [ ] **Step 2: Create `evals/.gitignore` belt-and-braces**

Write `evals/.gitignore`:

```
*
!.gitignore
```

This keeps the directory itself trackable (so the analyzer can rely on its existence) while ignoring every file inside.

- [ ] **Step 3: Create eval-task sidecar for hello-world**

Write `skills/hello-world/eval-task.md`:

```markdown
Print "Hello World" in 10 different languages to the terminal. Format the output as a list with the language name and the translation.
```

This is the natural-language task that should trigger the `hello-world` skill. Used for cheap smoke tests because it does not install software.

- [ ] **Step 4: Create eval-task sidecar for build-strata-rails-app**

Write `skills/build-strata-rails-app/eval-task.md`:

```markdown
Scaffold a new Nava Strata application using the Rails template in the current working directory. Name it `eval-test-app`. Walk through every step of the setup including installing prerequisites if missing.
```

- [ ] **Step 5: Verify gitignore wiring**

Run:

```sh
mkdir -p evals/sanity && touch evals/sanity/foo.txt
git status --short
```

Expected: `evals/` and its contents do **not** appear in `git status` output. The `evals/.gitignore` file itself is the only tracked artifact.

Then clean up:

```sh
rm -rf evals/sanity
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore evals/.gitignore skills/hello-world/eval-task.md skills/build-strata-rails-app/eval-task.md
git commit -m "feat(analyzer): scaffold evals dir and skill eval-task sidecars"
```

---

## Task 2: Test scaffold + `RunMetrics` + dev requirements

**Files:**
- Create: `requirements-dev.txt`
- Create: `tests/test_analyze_skill.py`
- Create (skeleton): `scripts/analyze_skill.py`

- [ ] **Step 1: Pin `anthropic` SDK in `requirements-dev.txt`**

Write `requirements-dev.txt`:

```
anthropic>=0.40.0
pytest>=7.4
```

Then install: `pip install -r requirements-dev.txt`

- [ ] **Step 2: Create empty analyzer module so imports resolve**

Write `scripts/analyze_skill.py`:

```python
#!/usr/bin/env python3
"""Skill analyzer — measure a skill's effect on a Managed Agents session."""
```

- [ ] **Step 3: Write the first failing tests for `RunMetrics`**

Note: token-count fields are intentionally absent (Managed Agents does not expose per-session token usage as of 2026-04-27). `runtime_cost_usd` is computed from `duration_ms × $0.08/hr` and stored on the dataclass.

Write `tests/test_analyze_skill.py`:

```python
"""Unit tests for scripts/analyze_skill.py."""

import json
from pathlib import Path

import pytest

from scripts.analyze_skill import (
    RunMetrics,
    compute_runtime_cost_usd,
)


def test_run_metrics_is_frozen_dataclass():
    m = RunMetrics(
        num_turns=4, duration_ms=12345,
        runtime_cost_usd=0.000274, is_error=False, error_reason=None,
    )
    with pytest.raises(Exception):
        m.num_turns = 99  # frozen


def test_compute_runtime_cost_usd_uses_eight_cents_per_hour():
    # 1 hour = 3,600,000 ms = $0.08
    assert compute_runtime_cost_usd(3_600_000) == pytest.approx(0.08)
    # 30 minutes = $0.04
    assert compute_runtime_cost_usd(1_800_000) == pytest.approx(0.04)
    # 0 ms = $0
    assert compute_runtime_cost_usd(0) == 0.0
```

- [ ] **Step 4: Run tests — confirm they fail**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: ImportError — `RunMetrics` and `compute_runtime_cost_usd` do not yet exist.

- [ ] **Step 5: Implement `RunMetrics` + `compute_runtime_cost_usd`**

Replace contents of `scripts/analyze_skill.py` with:

```python
#!/usr/bin/env python3
"""Skill analyzer — measure a skill's effect on a Managed Agents session."""

from dataclasses import dataclass


SESSION_RUNTIME_USD_PER_HOUR = 0.08


@dataclass(frozen=True)
class RunMetrics:
    num_turns: int
    duration_ms: int
    runtime_cost_usd: float
    is_error: bool
    error_reason: str | None


def compute_runtime_cost_usd(duration_ms: int) -> float:
    """Managed Agents charges $0.08 per session-hour of runtime."""
    hours = duration_ms / 3_600_000
    return hours * SESSION_RUNTIME_USD_PER_HOUR
```

- [ ] **Step 6: Run tests — confirm they pass**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add requirements-dev.txt scripts/analyze_skill.py tests/test_analyze_skill.py
git commit -m "feat(analyzer): RunMetrics dataclass and runtime-cost helper"
```

---

## Task 3: Skill discovery + eval-task sidecar loader (TDD)

**Files:**
- Modify: `scripts/analyze_skill.py`
- Modify: `tests/test_analyze_skill.py`

- [ ] **Step 1: Write failing tests for skill loader**

The `SkillBundle` now also carries the **body of `SKILL.md`** because Managed Agents takes the full body in the `system` field — there is no `--append-system-prompt-file` equivalent.

Append to `tests/test_analyze_skill.py`:

```python
from scripts.analyze_skill import SkillBundle, load_skill_bundle


def test_load_skill_bundle_reads_skill_md_body_and_eval_task(tmp_path):
    skill_dir = tmp_path / "skills" / "demo-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: demo-skill\ndescription: Demo.\n---\n\nBody here.\n"
    )
    (skill_dir / "eval-task.md").write_text("Do the demo task.\n")

    bundle = load_skill_bundle(tmp_path, "demo-skill")
    assert bundle.name == "demo-skill"
    assert "Body here." in bundle.skill_md_body
    assert bundle.eval_task.strip() == "Do the demo task."


def test_load_skill_bundle_missing_skill_raises(tmp_path):
    (tmp_path / "skills").mkdir()
    with pytest.raises(FileNotFoundError, match="missing-skill"):
        load_skill_bundle(tmp_path, "missing-skill")


def test_load_skill_bundle_missing_eval_task_raises(tmp_path):
    skill_dir = tmp_path / "skills" / "no-task-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("---\nname: no-task-skill\ndescription: x\n---\n")
    with pytest.raises(FileNotFoundError, match="eval-task.md"):
        load_skill_bundle(tmp_path, "no-task-skill")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest tests/test_analyze_skill.py -v -k "load_skill_bundle"`

Expected: failures — `SkillBundle` and `load_skill_bundle` undefined.

- [ ] **Step 3: Implement `SkillBundle` + `load_skill_bundle`**

Append to `scripts/analyze_skill.py`:

```python
from pathlib import Path


@dataclass(frozen=True)
class SkillBundle:
    name: str
    skill_md_body: str
    eval_task: str


def load_skill_bundle(repo_root: Path, skill_name: str) -> SkillBundle:
    """Load a skill's SKILL.md body and its eval-task.md prompt body.

    Raises FileNotFoundError if either file is missing.
    """
    skill_dir = repo_root / "skills" / skill_name
    skill_md = skill_dir / "SKILL.md"
    eval_task = skill_dir / "eval-task.md"

    if not skill_md.is_file():
        raise FileNotFoundError(
            f"Skill {skill_name!r}: expected {skill_md} to exist"
        )
    if not eval_task.is_file():
        raise FileNotFoundError(
            f"Skill {skill_name!r}: missing eval-task.md sidecar at {eval_task}. "
            f"Create it with the natural-language prompt that should trigger this skill."
        )

    return SkillBundle(
        name=skill_name,
        skill_md_body=skill_md.read_text(encoding="utf-8"),
        eval_task=eval_task.read_text(encoding="utf-8"),
    )
```

Place `from pathlib import Path` near the top of the file with the other imports.

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze_skill.py tests/test_analyze_skill.py
git commit -m "feat(analyzer): load SKILL.md body and eval-task.md sidecar"
```

---

## Task 4: Eval workdir preparation (TDD)

**Files:**
- Modify: `scripts/analyze_skill.py`
- Modify: `tests/test_analyze_skill.py`

- [ ] **Step 1: Write failing tests for `prepare_workdir`**

Append to `tests/test_analyze_skill.py`:

```python
import re

from scripts.analyze_skill import prepare_workdir


def test_prepare_workdir_creates_nested_dirs_with_timestamp(tmp_path):
    workdir = prepare_workdir(
        evals_root=tmp_path,
        skill_name="demo-skill",
        variant="with-skill",
        now_iso="2026-04-27T10-30-00",
    )
    assert workdir == tmp_path / "demo-skill" / "with-skill" / "2026-04-27T10-30-00"
    assert workdir.is_dir()


def test_prepare_workdir_rejects_unknown_variant(tmp_path):
    with pytest.raises(ValueError, match="variant"):
        prepare_workdir(
            evals_root=tmp_path,
            skill_name="demo-skill",
            variant="bogus",
            now_iso="2026-04-27T10-30-00",
        )


def test_prepare_workdir_timestamp_is_filesystem_safe(tmp_path):
    """ISO timestamps with colons break Windows paths; analyzer must use safe form."""
    from scripts.analyze_skill import current_iso_timestamp

    ts = current_iso_timestamp()
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}", ts), ts
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest tests/test_analyze_skill.py -v -k "prepare_workdir or current_iso"`

Expected: failures — `prepare_workdir` and `current_iso_timestamp` undefined.

- [ ] **Step 3: Implement workdir helpers**

Append to `scripts/analyze_skill.py`:

```python
from datetime import datetime, timezone

VALID_VARIANTS = ("with-skill", "without-skill")


def current_iso_timestamp() -> str:
    """Filesystem-safe ISO 8601 timestamp (UTC, colons replaced with dashes)."""
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")


def prepare_workdir(
    evals_root: Path,
    skill_name: str,
    variant: str,
    now_iso: str,
) -> Path:
    """Create and return evals_root/<skill>/<variant>/<timestamp>/."""
    if variant not in VALID_VARIANTS:
        raise ValueError(
            f"variant must be one of {VALID_VARIANTS}, got {variant!r}"
        )
    workdir = evals_root / skill_name / variant / now_iso
    workdir.mkdir(parents=True, exist_ok=True)
    return workdir
```

`datetime` import goes with the other top-of-file imports.

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze_skill.py tests/test_analyze_skill.py
git commit -m "feat(analyzer): create timestamped per-variant eval workdirs"
```

---

## Task 5: Markdown report generation (TDD)

**Files:**
- Modify: `scripts/analyze_skill.py`
- Modify: `tests/test_analyze_skill.py`

The report compares **turns**, **duration**, and **runtime cost**. It explicitly notes that token costs are not included and points the reader at the Anthropic billing dashboard.

- [ ] **Step 1: Write failing tests for `render_report`**

Append to `tests/test_analyze_skill.py`:

```python
from scripts.analyze_skill import render_report


def test_render_report_contains_table_and_both_runs():
    without = RunMetrics(
        num_turns=12, duration_ms=60000,
        runtime_cost_usd=compute_runtime_cost_usd(60000),
        is_error=False, error_reason=None,
    )
    with_skill = RunMetrics(
        num_turns=6, duration_ms=30000,
        runtime_cost_usd=compute_runtime_cost_usd(30000),
        is_error=False, error_reason=None,
    )
    md = render_report(
        skill_name="demo-skill",
        task_prompt="Do the thing.",
        without_skill=without,
        with_skill=with_skill,
        timestamp="2026-04-27T10-30-00",
    )

    assert "# Skill Analyzer Report: `demo-skill`" in md
    assert "2026-04-27T10-30-00" in md
    assert "Do the thing." in md
    assert "| Turns" in md  # table header row for turns
    assert "| 12 " in md or "| 12|" in md  # without-skill turns
    assert "| 6 " in md or "| 6|" in md   # with-skill turns
    assert "| Duration (ms)" in md
    assert "| Runtime cost (USD)" in md
    assert "-6" in md  # turns delta
    # Caveat about token costs not being included
    assert "token" in md.lower()
    assert "billing" in md.lower() or "dashboard" in md.lower()


def test_render_report_marks_errored_runs():
    errored = RunMetrics(
        num_turns=1, duration_ms=500,
        runtime_cost_usd=compute_runtime_cost_usd(500),
        is_error=True, error_reason="timeout after 600s",
    )
    ok = RunMetrics(
        num_turns=4, duration_ms=2000,
        runtime_cost_usd=compute_runtime_cost_usd(2000),
        is_error=False, error_reason=None,
    )
    md = render_report(
        skill_name="demo-skill",
        task_prompt="x",
        without_skill=errored,
        with_skill=ok,
        timestamp="2026-04-27T10-30-00",
    )
    assert "ERRORED" in md or "⚠️" in md
    assert "timeout after 600s" in md
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest tests/test_analyze_skill.py -v -k "render_report"`

Expected: failures — `render_report` undefined.

- [ ] **Step 3: Implement `render_report`**

Append to `scripts/analyze_skill.py`:

```python
def _fmt_int(n: int) -> str:
    return f"{n:,}"


def _fmt_delta_int(with_v: int, without_v: int) -> str:
    delta = with_v - without_v
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta:,}"


def _fmt_delta_float(with_v: float, without_v: float, decimals: int = 6) -> str:
    delta = with_v - without_v
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta:.{decimals}f}"


def render_report(
    skill_name: str,
    task_prompt: str,
    without_skill: RunMetrics,
    with_skill: RunMetrics,
    timestamp: str,
) -> str:
    """Render a markdown comparison report (turns, duration, runtime cost)."""
    error_lines = []
    for label, m in (("without-skill", without_skill), ("with-skill", with_skill)):
        if m.is_error:
            reason = m.error_reason or "unknown"
            error_lines.append(f"> ⚠️ **{label} ERRORED** — {reason}")
    error_block = ("\n".join(error_lines) + "\n") if error_lines else ""

    rows = [
        ("Turns",
         _fmt_int(without_skill.num_turns),
         _fmt_int(with_skill.num_turns),
         _fmt_delta_int(with_skill.num_turns, without_skill.num_turns)),
        ("Duration (ms)",
         _fmt_int(without_skill.duration_ms),
         _fmt_int(with_skill.duration_ms),
         _fmt_delta_int(with_skill.duration_ms, without_skill.duration_ms)),
        ("Runtime cost (USD)",
         f"{without_skill.runtime_cost_usd:.6f}",
         f"{with_skill.runtime_cost_usd:.6f}",
         _fmt_delta_float(with_skill.runtime_cost_usd, without_skill.runtime_cost_usd)),
    ]

    table_lines = [
        "| Metric | Without skill | With skill | Δ (with − without) |",
        "|---|---:|---:|---:|",
    ]
    for label, w, ws, d in rows:
        table_lines.append(f"| {label} | {w} | {ws} | {d} |")

    caveat = (
        "\n> **Note on token costs:** the Managed Agents API does not expose per-session "
        "token usage at the time of writing. The `Runtime cost` column reflects only the "
        "$0.08/hr session-runtime fee. Token-input/output costs must be reconciled via the "
        "Anthropic billing dashboard at https://console.anthropic.com/settings/billing.\n"
    )

    return (
        f"# Skill Analyzer Report: `{skill_name}`\n"
        f"\n"
        f"**Timestamp:** {timestamp}\n"
        f"\n"
        f"**Task prompt:**\n"
        f"\n"
        f"> {task_prompt.strip()}\n"
        f"{error_block}"
        + "\n"
        + "\n".join(table_lines)
        + "\n"
        + caveat
    )
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze_skill.py tests/test_analyze_skill.py
git commit -m "feat(analyzer): render markdown comparison table"
```

---

## Task 6: Build Managed Agents `system` prompt for each variant (TDD)

**Files:**
- Modify: `scripts/analyze_skill.py`
- Modify: `tests/test_analyze_skill.py`

The "with-skill" system prompt is the base prompt + the SKILL.md body. The "without-skill" prompt is just the base prompt. This is the analyzer's A/B knob.

- [ ] **Step 1: Write failing tests for `build_system_prompt`**

Append to `tests/test_analyze_skill.py`:

```python
from scripts.analyze_skill import build_system_prompt, BASE_SYSTEM_PROMPT


def test_build_system_prompt_with_skill_appends_body():
    sp = build_system_prompt(variant="with-skill", skill_md_body="SKILL BODY HERE")
    assert sp.startswith(BASE_SYSTEM_PROMPT)
    assert "SKILL BODY HERE" in sp
    # Skill body separated with a clear marker
    assert "Skill documentation" in sp or "---" in sp


def test_build_system_prompt_without_skill_omits_body():
    sp = build_system_prompt(variant="without-skill", skill_md_body="SKILL BODY HERE")
    assert sp == BASE_SYSTEM_PROMPT
    assert "SKILL BODY HERE" not in sp


def test_build_system_prompt_rejects_unknown_variant():
    with pytest.raises(ValueError, match="variant"):
        build_system_prompt(variant="bogus", skill_md_body="x")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest tests/test_analyze_skill.py -v -k "build_system_prompt"`

Expected: failures — `build_system_prompt` and `BASE_SYSTEM_PROMPT` undefined.

- [ ] **Step 3: Implement `build_system_prompt`**

Append to `scripts/analyze_skill.py`:

```python
BASE_SYSTEM_PROMPT = (
    "You are an autonomous coding agent running inside an isolated cloud sandbox. "
    "You have access to bash, file editing, and network tools. "
    "Complete the user's task to the best of your ability and stop when finished."
)


def build_system_prompt(variant: str, skill_md_body: str) -> str:
    """Compose the agent's system prompt for one variant.

    with-skill: BASE_SYSTEM_PROMPT + the full SKILL.md body, separated by a marker.
    without-skill: BASE_SYSTEM_PROMPT only.
    """
    if variant not in VALID_VARIANTS:
        raise ValueError(f"variant must be one of {VALID_VARIANTS}, got {variant!r}")

    if variant == "without-skill":
        return BASE_SYSTEM_PROMPT

    return (
        f"{BASE_SYSTEM_PROMPT}\n"
        f"\n"
        f"---\n"
        f"Skill documentation (apply this when relevant):\n"
        f"---\n"
        f"\n"
        f"{skill_md_body.strip()}\n"
    )
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze_skill.py tests/test_analyze_skill.py
git commit -m "feat(analyzer): build per-variant system prompts"
```

---

## Task 7: Run one variant via Managed Agents (TDD with SDK mocked)

**Files:**
- Modify: `scripts/analyze_skill.py`
- Modify: `tests/test_analyze_skill.py`

This is the heart of the rewrite. `run_variant` now performs the three-step Managed Agents lifecycle:

1. `client.beta.agents.create(name=..., model=..., system=..., tools=[{"type": "agent_toolset_20260401"}])`
2. `client.beta.environments.create(name=..., config={"type": "cloud", "networking": {"type": "unrestricted"}})`
3. `client.beta.sessions.create(agent=agent.id, environment_id=env.id, title=...)`
4. Open `client.beta.sessions.events.stream(session.id)` as a context manager.
5. Inside the stream context, send the user message: `client.beta.sessions.events.send(session.id, events=[{"type": "user.message", "content": [{"type": "text", "text": prompt}]}])`.
6. Iterate the stream. For each event with `type == "agent.message"`, increment a turn counter. Break when an event with `type == "session.status_idle"` arrives.
7. Enforce a wall-clock timeout. If exceeded, call `client.beta.sessions.terminate(session.id)` and return an error-flagged `RunMetrics` with `error_reason="timeout after Ns"`.
8. Persist the raw event log + agent/env/session IDs to `workdir/session-events.jsonl` and `workdir/session-meta.json`.

Tests fully mock the SDK so they run offline.

- [ ] **Step 1: Write failing tests using a stubbed SDK client**

Append to `tests/test_analyze_skill.py`:

```python
from types import SimpleNamespace
from unittest.mock import MagicMock

from scripts.analyze_skill import run_variant


def _fake_event(type_, **kwargs):
    """Construct a fake SDK event object that exposes attributes used by run_variant."""
    return SimpleNamespace(type=type_, **kwargs)


class _FakeStream:
    """Context-managed iterable that yields a preset list of fake events."""
    def __init__(self, events):
        self._events = events
    def __enter__(self):
        return iter(self._events)
    def __exit__(self, *exc):
        return False


def _build_fake_client(events):
    """Construct a MagicMock SDK client that returns predetermined objects."""
    client = MagicMock()
    client.beta.agents.create.return_value = SimpleNamespace(id="agent_123")
    client.beta.environments.create.return_value = SimpleNamespace(id="env_456")
    client.beta.sessions.create.return_value = SimpleNamespace(id="sess_789", status="idle")
    client.beta.sessions.events.stream.return_value = _FakeStream(events)
    return client


def test_run_variant_counts_turns_and_writes_artifacts(tmp_path):
    workdir = tmp_path / "wd"
    workdir.mkdir()

    events = [
        _fake_event("agent.message", content=[]),
        _fake_event("agent.tool_use", name="bash"),
        _fake_event("agent.message", content=[]),
        _fake_event("session.status_idle"),
    ]
    client = _build_fake_client(events)

    metrics = run_variant(
        client=client,
        skill_md_body="body",
        variant="with-skill",
        eval_prompt="Do thing",
        model="claude-opus-4-7",
        workdir=workdir,
        timeout_seconds=30,
    )

    # 2 agent.message events => 2 turns
    assert metrics.num_turns == 2
    assert metrics.is_error is False
    assert metrics.duration_ms >= 0

    # Agent created with the with-skill system prompt
    agent_kwargs = client.beta.agents.create.call_args.kwargs
    assert "body" in agent_kwargs["system"]
    assert agent_kwargs["model"] == "claude-opus-4-7"

    # Workdir artifacts
    assert (workdir / "session-meta.json").is_file()
    meta = json.loads((workdir / "session-meta.json").read_text())
    assert meta["agent_id"] == "agent_123"
    assert meta["environment_id"] == "env_456"
    assert meta["session_id"] == "sess_789"
    # Events log is JSONL, one event per line
    log = (workdir / "session-events.jsonl").read_text().splitlines()
    assert len(log) == 4
    assert json.loads(log[0])["type"] == "agent.message"


def test_run_variant_terminates_on_timeout(tmp_path, monkeypatch):
    """If timeout fires before session.status_idle, terminate and report error."""
    import time as time_mod

    workdir = tmp_path / "wd"
    workdir.mkdir()

    # Stream that never yields session.status_idle
    events = [_fake_event("agent.message", content=[]) for _ in range(5)]
    client = _build_fake_client(events)

    # Force time.monotonic to advance past the timeout on the second call
    base = [1000.0]
    times = iter([1000.0, 1000.0, 1000.0, 9999.0, 9999.0, 9999.0])
    monkeypatch.setattr(
        "scripts.analyze_skill.time.monotonic",
        lambda: next(times, 9999.0),
    )

    metrics = run_variant(
        client=client,
        skill_md_body="body",
        variant="without-skill",
        eval_prompt="x",
        model=None,
        workdir=workdir,
        timeout_seconds=60,
    )
    assert metrics.is_error is True
    assert "timeout" in metrics.error_reason.lower()
    client.beta.sessions.terminate.assert_called_once_with("sess_789")


def test_run_variant_records_sdk_exception_as_error(tmp_path):
    workdir = tmp_path / "wd"
    workdir.mkdir()

    client = MagicMock()
    client.beta.agents.create.side_effect = RuntimeError("API down")

    metrics = run_variant(
        client=client,
        skill_md_body="body",
        variant="without-skill",
        eval_prompt="x",
        model=None,
        workdir=workdir,
        timeout_seconds=60,
    )
    assert metrics.is_error is True
    assert "API down" in metrics.error_reason
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest tests/test_analyze_skill.py -v -k "run_variant"`

Expected: failures — `run_variant` undefined.

- [ ] **Step 3: Implement `run_variant`**

Append to `scripts/analyze_skill.py`:

```python
import json
import time

DEFAULT_MODEL = "claude-opus-4-7"
AGENT_TOOLSET_VERSION = "agent_toolset_20260401"
ENVIRONMENT_NETWORKING = {"type": "unrestricted"}


def _serialize_event(event) -> dict:
    """Best-effort serialization of an SDK event object to a JSON-safe dict."""
    if hasattr(event, "model_dump"):
        return event.model_dump()
    if hasattr(event, "__dict__"):
        return {k: _to_jsonable(v) for k, v in event.__dict__.items()}
    return {"repr": repr(event)}


def _to_jsonable(v):
    if hasattr(v, "model_dump"):
        return v.model_dump()
    if hasattr(v, "__dict__"):
        return {k: _to_jsonable(x) for k, x in v.__dict__.items()}
    if isinstance(v, (list, tuple)):
        return [_to_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: _to_jsonable(x) for k, x in v.items()}
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    return repr(v)


def run_variant(
    client,
    skill_md_body: str,
    variant: str,
    eval_prompt: str,
    model: str | None,
    workdir: Path,
    timeout_seconds: int,
) -> RunMetrics:
    """Execute one Managed Agents variant.

    Lifecycle: create agent → create environment → create session → open event
    stream → send user message → iterate events until session.status_idle or
    timeout. On timeout, terminate the session via the SDK.
    """
    if variant not in VALID_VARIANTS:
        raise ValueError(f"variant must be one of {VALID_VARIANTS}, got {variant!r}")

    system_prompt = build_system_prompt(variant=variant, skill_md_body=skill_md_body)
    chosen_model = model or DEFAULT_MODEL

    events_path = workdir / "session-events.jsonl"
    meta_path = workdir / "session-meta.json"

    started_at = time.monotonic()
    deadline = started_at + timeout_seconds

    agent_id = env_id = session_id = None
    num_turns = 0
    error_reason: str | None = None

    try:
        agent = client.beta.agents.create(
            name=f"skill-analyzer-{variant}",
            model=chosen_model,
            system=system_prompt,
            tools=[{"type": AGENT_TOOLSET_VERSION}],
        )
        agent_id = agent.id

        environment = client.beta.environments.create(
            name=f"skill-analyzer-env-{variant}-{int(time.time())}",
            config={"type": "cloud", "networking": ENVIRONMENT_NETWORKING},
        )
        env_id = environment.id

        session = client.beta.sessions.create(
            agent=agent.id,
            environment_id=environment.id,
            title=f"skill-analyzer ({variant})",
        )
        session_id = session.id

        with events_path.open("w", encoding="utf-8") as ev_log:
            with client.beta.sessions.events.stream(session.id) as stream:
                client.beta.sessions.events.send(
                    session.id,
                    events=[{
                        "type": "user.message",
                        "content": [{"type": "text", "text": eval_prompt}],
                    }],
                )
                for event in stream:
                    ev_log.write(json.dumps(_serialize_event(event)) + "\n")
                    ev_log.flush()
                    etype = getattr(event, "type", None)
                    if etype == "agent.message":
                        num_turns += 1
                    if etype == "session.status_idle":
                        break
                    if time.monotonic() > deadline:
                        error_reason = f"timeout after {timeout_seconds}s"
                        try:
                            client.beta.sessions.terminate(session.id)
                        except Exception as e:
                            error_reason += f" (terminate failed: {e})"
                        break
    except Exception as e:  # SDK or network failure
        error_reason = f"{type(e).__name__}: {e}"

    duration_ms = int((time.monotonic() - started_at) * 1000)

    meta_path.write_text(json.dumps({
        "agent_id": agent_id,
        "environment_id": env_id,
        "session_id": session_id,
        "variant": variant,
        "model": chosen_model,
        "duration_ms": duration_ms,
        "error_reason": error_reason,
    }, indent=2))

    return RunMetrics(
        num_turns=num_turns,
        duration_ms=duration_ms,
        runtime_cost_usd=compute_runtime_cost_usd(duration_ms),
        is_error=error_reason is not None,
        error_reason=error_reason,
    )
```

Note: place `import json` and `import time` near the top of the file with the other imports.

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: 16 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze_skill.py tests/test_analyze_skill.py
git commit -m "feat(analyzer): run one variant via Managed Agents lifecycle"
```

---

## Task 8: CLI entrypoint `main` (TDD with mocked `run_variant`)

**Files:**
- Modify: `scripts/analyze_skill.py`
- Modify: `tests/test_analyze_skill.py`

- [ ] **Step 1: Write failing test for `main` end-to-end with mocks**

`main` must:
- Refuse to start if `ANTHROPIC_API_KEY` is not set (clear error, exit 2).
- Build the SDK client lazily (so unit tests can monkeypatch it).
- Run both variants sequentially.
- Render and write the markdown report.
- Print the report path to stdout.

Append to `tests/test_analyze_skill.py`:

```python
from scripts.analyze_skill import main


def _fake_skill_layout(tmp_path):
    skills_dir = tmp_path / "skills" / "demo-skill"
    skills_dir.mkdir(parents=True)
    (skills_dir / "SKILL.md").write_text(
        "---\nname: demo-skill\ndescription: Demo.\n---\n\nbody\n"
    )
    (skills_dir / "eval-task.md").write_text("Do the demo.\n")
    evals_root = tmp_path / "evals"
    evals_root.mkdir()
    return evals_root


def test_main_writes_report_and_returns_zero(tmp_path, monkeypatch, capsys):
    evals_root = _fake_skill_layout(tmp_path)

    fake_metrics_without = RunMetrics(
        num_turns=10, duration_ms=40000,
        runtime_cost_usd=compute_runtime_cost_usd(40000),
        is_error=False, error_reason=None,
    )
    fake_metrics_with = RunMetrics(
        num_turns=5, duration_ms=20000,
        runtime_cost_usd=compute_runtime_cost_usd(20000),
        is_error=False, error_reason=None,
    )

    def fake_run_variant(client, skill_md_body, variant, eval_prompt, model, workdir, timeout_seconds):
        (workdir / "session-meta.json").write_text("{}")
        return fake_metrics_with if variant == "with-skill" else fake_metrics_without

    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    monkeypatch.setattr("scripts.analyze_skill.run_variant", fake_run_variant)
    monkeypatch.setattr("scripts.analyze_skill.current_iso_timestamp", lambda: "2026-04-27T10-30-00")
    monkeypatch.setattr("scripts.analyze_skill.build_anthropic_client", lambda: MagicMock())

    rc = main([
        "--skill", "demo-skill",
        "--repo-root", str(tmp_path),
        "--evals-root", str(evals_root),
        "--timeout", "300",
    ])

    assert rc == 0
    report_path = evals_root / "demo-skill" / "report-2026-04-27T10-30-00.md"
    assert report_path.is_file()
    body = report_path.read_text()
    assert "demo-skill" in body
    assert "Do the demo." in body
    out = capsys.readouterr().out
    assert str(report_path) in out


def test_main_returns_two_when_api_key_missing(tmp_path, monkeypatch, capsys):
    _fake_skill_layout(tmp_path)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    rc = main([
        "--skill", "demo-skill",
        "--repo-root", str(tmp_path),
        "--evals-root", str(tmp_path / "evals"),
    ])
    assert rc == 2
    err = capsys.readouterr().err
    assert "ANTHROPIC_API_KEY" in err


def test_main_returns_one_when_skill_missing(tmp_path, monkeypatch, capsys):
    (tmp_path / "skills").mkdir()
    (tmp_path / "evals").mkdir()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key")
    monkeypatch.setattr("scripts.analyze_skill.build_anthropic_client", lambda: MagicMock())

    rc = main([
        "--skill", "nonexistent",
        "--repo-root", str(tmp_path),
        "--evals-root", str(tmp_path / "evals"),
    ])
    assert rc == 1
    err = capsys.readouterr().err
    assert "nonexistent" in err
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest tests/test_analyze_skill.py -v -k "main"`

Expected: failures — `main` and `build_anthropic_client` undefined.

- [ ] **Step 3: Implement `parse_args`, `build_anthropic_client`, and `main`**

Append to `scripts/analyze_skill.py`:

```python
import argparse
import os
import sys


DEFAULT_TIMEOUT_SECONDS = 1800  # 30 minutes per variant


def build_anthropic_client():
    """Construct an Anthropic SDK client with the Managed Agents beta header.

    Imported lazily so unit tests can monkeypatch this without importing the SDK.
    """
    from anthropic import Anthropic
    return Anthropic(
        api_key=os.environ["ANTHROPIC_API_KEY"],
        default_headers={"anthropic-beta": "managed-agents-2026-04-01"},
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="analyze_skill",
        description="Compare a Managed Agents run with vs without a given skill.",
    )
    p.add_argument("--skill", required=True, help="Skill name (matches skills/<name>/)")
    p.add_argument("--repo-root", default=".", help="Repo root (default: cwd)")
    p.add_argument("--evals-root", default="evals", help="Eval workdir root (default: ./evals)")
    p.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS,
                   help=f"Per-variant timeout seconds (default: {DEFAULT_TIMEOUT_SECONDS})")
    p.add_argument("--model", default=None, help=f"Override model (default: {DEFAULT_MODEL})")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "error: ANTHROPIC_API_KEY environment variable is not set. "
            "Set it to a key from https://console.anthropic.com/settings/keys",
            file=sys.stderr,
        )
        return 2

    repo_root = Path(args.repo_root).resolve()
    evals_root = Path(args.evals_root).resolve()
    evals_root.mkdir(parents=True, exist_ok=True)

    try:
        bundle = load_skill_bundle(repo_root, args.skill)
    except FileNotFoundError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    client = build_anthropic_client()
    timestamp = current_iso_timestamp()
    print(f"Analyzing skill: {bundle.name} @ {timestamp}")
    print(f"Task: {bundle.eval_task.strip()[:120]}")
    print(f"Timeout: {args.timeout}s per variant. "
          f"Runtime cost cap: ${args.timeout * 2 / 3600 * SESSION_RUNTIME_USD_PER_HOUR:.4f} "
          f"(token costs are NOT capped — monitor billing dashboard).")

    results: dict[str, RunMetrics] = {}
    for variant in VALID_VARIANTS:
        workdir = prepare_workdir(evals_root, bundle.name, variant, timestamp)
        print(f"  → Running {variant} in {workdir}")
        metrics = run_variant(
            client=client,
            skill_md_body=bundle.skill_md_body,
            variant=variant,
            eval_prompt=bundle.eval_task,
            model=args.model,
            workdir=workdir,
            timeout_seconds=args.timeout,
        )
        results[variant] = metrics
        status = "ERROR" if metrics.is_error else "ok"
        print(f"    {status}: {metrics.num_turns} turns, "
              f"{metrics.duration_ms}ms, "
              f"runtime ${metrics.runtime_cost_usd:.6f}")
        if metrics.is_error:
            print(f"    reason: {metrics.error_reason}")
        print(f"    artifacts: {workdir}")

    report_md = render_report(
        skill_name=bundle.name,
        task_prompt=bundle.eval_task,
        without_skill=results["without-skill"],
        with_skill=results["with-skill"],
        timestamp=timestamp,
    )
    report_path = evals_root / bundle.name / f"report-{timestamp}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report_md, encoding="utf-8")
    print(f"\nReport: {report_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Note: keep imports (`argparse`, `os`, `sys`) at the top of the file in Task 9.

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: 19 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze_skill.py tests/test_analyze_skill.py
git commit -m "feat(analyzer): wire main() entrypoint and CLI args"
```

---

## Task 9: Reorder imports + final tidy on `scripts/analyze_skill.py`

**Files:**
- Modify: `scripts/analyze_skill.py`

This task consolidates the imports that were appended throughout TDD into a single block at the top of the file, in stdlib order. No behavior change.

- [ ] **Step 1: Read the current file**

Run: `sed -n '1,30p' scripts/analyze_skill.py` to see the current import layout.

- [ ] **Step 2: Move all imports to the top of the file**

Edit `scripts/analyze_skill.py` so the file begins with:

```python
#!/usr/bin/env python3
"""Skill analyzer — measure a skill's effect on a Managed Agents session."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
```

Then remove every duplicated `import` line that was added in later tasks (`from pathlib import Path`, `from datetime import ...`, `import json`, `import time`, `import argparse`, `import os`, `import sys`) further down in the file.

`from anthropic import Anthropic` stays inside `build_anthropic_client` so unit tests do not need the SDK installed to import the module.

- [ ] **Step 3: Run all tests to verify no regression**

Run: `python -m pytest tests/test_analyze_skill.py -v`

Expected: 19 passed.

- [ ] **Step 4: Run the existing skill linter to confirm nothing broke**

Run: `python scripts/lint_skills.py`

Expected: `✓ 2 skill(s) passed linting.`

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze_skill.py
git commit -m "refactor(analyzer): consolidate imports at top of file"
```

---

## Task 10: Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Write the Makefile**

Write `Makefile`:

```makefile
.PHONY: help analyze-skill lint test deps

help:
	@echo "Targets:"
	@echo "  make analyze-skill SKILL=<name> [TIMEOUT=1800] [MODEL=claude-opus-4-7]"
	@echo "      Run with-skill vs without-skill comparison via Managed Agents."
	@echo "      Requires ANTHROPIC_API_KEY env var. Emits evals/<skill>/report-*.md."
	@echo "  make deps    Install Python dev dependencies"
	@echo "  make lint    Run skill linter"
	@echo "  make test    Run pytest"

# Defaults are also encoded in scripts/analyze_skill.py; keep them in sync.
TIMEOUT ?= 1800
MODEL ?=

deps:
	pip install -r requirements-dev.txt

analyze-skill:
	@if [ -z "$(SKILL)" ]; then \
		echo "error: SKILL=<name> is required. Example: make analyze-skill SKILL=hello-world"; \
		exit 2; \
	fi
	@if [ -z "$$ANTHROPIC_API_KEY" ]; then \
		echo "error: ANTHROPIC_API_KEY is not set. Export it before running."; \
		exit 2; \
	fi
	python scripts/analyze_skill.py \
		--skill "$(SKILL)" \
		--timeout $(TIMEOUT) \
		$(if $(MODEL),--model $(MODEL),)

lint:
	python scripts/lint_skills.py

test:
	python -m pytest tests/ -v
```

- [ ] **Step 2: Verify `make help` works**

Run: `make help`

Expected: prints the four target descriptions, exit 0.

- [ ] **Step 3: Verify SKILL guard fires when missing**

Run: `make analyze-skill`

Expected: prints `error: SKILL=<name> is required...` and exits with code 2.

- [ ] **Step 4: Verify API-key guard fires when env var missing**

Run: `unset ANTHROPIC_API_KEY && make analyze-skill SKILL=hello-world; echo $?`

Expected: prints the API-key error and exits 2.

- [ ] **Step 5: Verify `make lint` and `make test` still work**

Run: `make lint && make test`

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add Makefile
git commit -m "feat(analyzer): add make analyze-skill target"
```

---

## Task 11: Smoke test the full pipeline on `hello-world`

This task **invokes the real Managed Agents API** and costs real money (small — `hello-world` is trivial). Token costs are billed against the configured `ANTHROPIC_API_KEY`.

**Files:** none (verification only).

- [ ] **Step 1: Confirm SDK is installed and API key is set**

Run:
```sh
python -c "from anthropic import Anthropic; print(Anthropic)"
echo "API key set: $([ -n "$ANTHROPIC_API_KEY" ] && echo yes || echo no)"
```

Expected: `<class 'anthropic.Anthropic'>` and `API key set: yes`. If either fails, run `make deps` and/or `export ANTHROPIC_API_KEY=...`.

- [ ] **Step 2: Run the analyzer end-to-end on hello-world**

Run: `make analyze-skill SKILL=hello-world TIMEOUT=180`

Expected:
- Two workdirs created under `evals/hello-world/with-skill/<ts>/` and `evals/hello-world/without-skill/<ts>/`, each containing `session-events.jsonl` and `session-meta.json`.
- A report at `evals/hello-world/report-<ts>.md`.
- Stdout shows two lines like `ok: N turns, Mms, runtime $X.XXXXXX`.

- [ ] **Step 3: Read the report and sanity-check it**

Run: `cat evals/hello-world/report-*.md | head -40`

Expected: a markdown header `# Skill Analyzer Report: \`hello-world\`` followed by the metrics table with non-zero values for both columns and the token-cost caveat block.

- [ ] **Step 4: Sanity-check session-meta.json**

Run: `cat evals/hello-world/with-skill/*/session-meta.json | python -m json.tool`

Expected: a JSON object with `agent_id`, `environment_id`, `session_id`, `model`, `duration_ms`, and `error_reason: null`.

- [ ] **Step 5: Confirm `evals/` is still gitignored**

Run: `git status --short`

Expected: no `evals/...` entries in the output.

- [ ] **Step 6: No commit**

This task produces no committable artifacts (the `evals/` outputs are gitignored).

---

## Task 12: Update `README.md` and `CLAUDE.md`

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the current README**

Run: `cat README.md`

- [ ] **Step 2: Append a "Skill analyzer" section to `README.md`**

Append to `README.md`:

```markdown

## Skill analyzer

Run a local A/B comparison of a skill via **Anthropic Managed Agents**: one cloud session with the skill's `SKILL.md` body in the system prompt, one without. Each session runs in an Anthropic-hosted sandbox VM, so skills that install software (Docker, package managers, etc.) cannot affect your local machine.

```sh
export ANTHROPIC_API_KEY=sk-ant-...        # from console.anthropic.com/settings/keys
make deps                                  # one-time: install anthropic + pytest
make analyze-skill SKILL=hello-world
make analyze-skill SKILL=build-strata-rails-app TIMEOUT=3600
```

The analyzer requires an `eval-task.md` sidecar inside the skill's directory. This file holds the natural-language task that should trigger the skill (the same prompt is sent to both variants).

Output:
- `evals/<skill>/with-skill/<timestamp>/session-events.jsonl` — full SSE event log from the with-skill cloud session.
- `evals/<skill>/with-skill/<timestamp>/session-meta.json` — agent / environment / session IDs and timing.
- `evals/<skill>/without-skill/<timestamp>/...` — same, for the without-skill run.
- `evals/<skill>/report-<timestamp>.md` — markdown table comparing turns, duration, and session-runtime cost.

The whole `evals/` directory is gitignored.

### Caveats

- **Cost is real and uncapped.** Each invocation hits the Anthropic API and bills against your `ANTHROPIC_API_KEY`. Pricing is standard per-token rates (e.g. Opus 4.7: $5/MTok input, $25/MTok output) plus a $0.08/session-hour runtime fee. The analyzer enforces a per-variant wall-clock `--timeout` (default 1800s = 30min) which bounds the runtime fee, but **token cost is not capped**. Watch the billing dashboard at https://console.anthropic.com/settings/billing.
- **Token usage is not in the report.** Managed Agents does not expose per-session token usage in its API at the time of writing. The report shows turns + duration + session-runtime cost only. Token spend must be reconciled separately via the billing dashboard.
- **Sandbox is the cloud VM.** The agent has full bash, file editing, and network access inside the disposable Anthropic-hosted container. Side effects (file writes, software installs) stay there and are torn down when the session ends.
- **The "with-skill" approximation.** The skill body is placed in the agent's `system` prompt rather than loaded lazily via the Skill tool. Token totals therefore include the full SKILL.md eagerly; the relative comparison is still meaningful.
- **Beta API.** Managed Agents uses the `managed-agents-2026-04-01` beta header. Field names and response shapes may change.
```

(The triple-backtick fences inside the appended block are part of the README markdown.)

- [ ] **Step 3: Add a Commands entry in `CLAUDE.md`**

Edit `CLAUDE.md` — under the existing `## Commands` section, replace the code block with:

```markdown
## Commands

```bash
# Run linter on all skills
python scripts/lint_skills.py

# Run linter unit tests
python -m pytest tests/test_lint_skills.py -v

# Run a single test
python -m pytest tests/test_lint_skills.py -v -k "test_name_here"

# Compare a skill with vs without its body in the system prompt, via
# Anthropic Managed Agents (cloud sandbox). Requires ANTHROPIC_API_KEY.
# Each skill must have a `skills/<name>/eval-task.md` sidecar.
make analyze-skill SKILL=<name> [TIMEOUT=1800] [MODEL=claude-opus-4-7]
```
```

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(analyzer): document make analyze-skill via Managed Agents"
```

---

## Self-Review Checklist (run by the executor before declaring done)

1. **Spec coverage** — every requirement from the user's spec maps to a task:
   - "Called by a make command" → Task 10 (Makefile target).
   - "Run locally for a dev" → Task 10 (no CI changes; Task 1 confirms gitignore).
   - "Number of turns" → Tasks 2 + 7 (`num_turns` counted from `agent.message` events).
   - "evals subfolder ignored by Git" → Task 1.
   - "Run in a sandbox where `--dangerously-skip-permissions` is not a danger" → Task 7 (Managed Agents cloud session is the sandbox; flag is no longer needed).
   - "Compares running the skill to the same task without the skill" → Tasks 6 + 7 (`build_system_prompt` per variant + two `run_variant` calls).
   - "Output is markdown with a table" → Task 5 (`render_report`).
   - "Use Managed Agent implementation" → Task 7 (three-step lifecycle: agent → environment → session → events stream).

2. **Token-metric gap is documented, not silently dropped.** Task 5's `render_report` includes a billing-dashboard caveat block; README also documents it (Task 12). If a future Anthropic SDK release exposes `usage`, the change is local to `run_variant` and `render_report`.

3. **Placeholder scan** — no "TBD" / "implement later" / abstract steps. Every step that writes code shows the code; every step that runs a command shows the command.

4. **Type/name consistency** — `RunMetrics` field names (`num_turns`, `duration_ms`, `runtime_cost_usd`, `is_error`, `error_reason`) match across `compute_runtime_cost_usd`, `render_report`, and `run_variant`. The CLI arg `--evals-root` is consistent across `main`, `parse_args`, and the Makefile (which uses the analyzer's default of `./evals` and does not pass `--evals-root`). `VALID_VARIANTS` is referenced from `prepare_workdir`, `build_system_prompt`, `run_variant`, and `main` — single source of truth.

5. **TDD ordering** — every Python task has Test → Run-fail → Implement → Run-pass → Commit. Smoke test (Task 11) is integration-only and produces no commit.

6. **SDK isolation** — `build_anthropic_client` is the only place the SDK is imported (lazily, inside the function), so unit tests don't require `anthropic` to import `scripts.analyze_skill`. `run_variant` accepts the client as a parameter, making it fully mockable.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-27-skill-analyzer.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
