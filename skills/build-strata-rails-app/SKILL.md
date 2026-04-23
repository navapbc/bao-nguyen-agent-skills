---
name: build-strata-rails-app
description: Use when the user wants to scaffold, bootstrap, start, or create a new Nava Strata application from the Rails application template (navapbc/template-application-rails) using the Nava Platform CLI. Triggers on "build a strata app", "start a strata rails app", "scaffold a rails app", "apply the rails template", "set up template-application-rails", or when the user is in a fresh/empty project directory and mentions Strata + Rails.
---

# Build Strata Rails App

## Overview

Scaffolds a new Nava Strata application in the user's current project directory using `nava-platform app install` with the Rails application template, then runs the app's make targets to verify it compiles and tests pass.

**Supported templates (currently):** Rails only. Next.js and Python/Flask templates exist but are **not supported** by this skill — stop and tell the user if they ask for those.

## Step 1: Confirm intent

Ask the user exactly this:

> **Are you trying to build a Strata app? (reply "skip" to exit, otherwise say yes)**

- If reply is "skip" / "no" / "exit" / anything declining → stop the skill. Do not proceed. Do not run any commands.
- If reply confirms → proceed to Step 2.

## Step 2: Check / install Nava Platform CLI

Check whether `nava-platform` is installed:

```sh
nava-platform --version
```

- If the command succeeds → CLI installed, proceed to Step 3.
- If the command fails (not found / error) → install it.

**Install via `uv` (preferred):**

First check whether `uv` is available:

```sh
uv --version
```

- If `uv` is installed, run:
  ```sh
  uv tool install git+https://github.com/navapbc/platform-cli
  ```
- If `uv` is NOT installed, tell the user that `uv` is required and point them to https://docs.astral.sh/uv/getting-started/installation/ — then stop. Do not attempt alternative install methods (pipx, nix, docker) without user confirmation.

After install, re-run `nava-platform --version` to verify. If still failing, stop and report the error to the user.

## Step 3: Confirm template choice

Tell the user the three platform-supported application templates are:
- **Rails** (template-application-rails) — supported by this skill
- Next.js (template-application-nextjs) — not supported here
- Python/Flask (template-application-flask) — not supported here

Confirm they want Rails. If they want another template, stop and direct them to install it manually per the platform-cli docs.

## Step 4: Ensure current directory is a git repository

Run:

```sh
git rev-parse --is-inside-work-tree
```

- If it prints `true` → already a git repo, proceed.
- If it errors → current dir is not a git repo. Run `git init` in the current working directory, then proceed.

**Do NOT** run `git init` if the directory already is inside a git repo — it would be redundant.

## Step 5: Ask for the app name

Ask the user:

> **What should the app be called?** (lowercase letters, digits, dashes, underscores only — e.g. `my-super-awesome-app`)

Validate the answer matches `^[a-z0-9_-]+$`. If not, ask again.

Store the answer as `<APP_NAME>`.

## Step 6: Apply the Rails template

Run from the current project directory (the git repo root from Step 4):

```sh
nava-platform app install --template-uri https://github.com/navapbc/template-application-rails . <APP_NAME>
```

This creates a `<APP_NAME>/` subdirectory containing the generated Rails app.

If the command prompts for any values, pass through the user's answers. If it errors, stop and report the error.

## Step 7: cd into the generated app directory

```sh
cd <APP_NAME>
```

All subsequent commands run from inside `<APP_NAME>/`.

## Step 8: Prepare and verify the app

Run the following make targets **in order**. Each must succeed before running the next:

1. `make .env` — generate the local `.env` file
2. `make build` — build the container image
3. `make precompile-assets` — precompile Rails assets
4. `make lint` — run linters (rubocop etc.)
5. `make test` — run the rspec test suite

If any step fails, stop and report the exact error to the user. Do not proceed to later steps on failure.

## Step 9: Report success

If `make lint` and `make test` both pass, the app compiled correctly. Tell the user:

> **App is ready.** Run `make start-container` from inside `<APP_NAME>/`, then visit http://localhost:3000

## Common pitfalls

| Problem | Fix |
|---------|-----|
| `nava-platform: command not found` after install | Ensure `~/.local/bin` (or uv tool install path) is on `$PATH`; user may need to restart shell |
| `make build` fails with Docker errors | Docker daemon not running — ask user to start Docker Desktop |
| `Makefile` merge conflict during `app install` | Usually accept the app template's Makefile version (per platform-cli docs on adding-an-app) |
| User asks for Next.js / Python-Flask | Stop. This skill only supports Rails. Direct them to manual CLI usage. |
| Running `nava-platform app install` outside a git repo | `copier` requires git; Step 4 prevents this |

## Reference

- Platform CLI docs: https://github.com/navapbc/platform-cli
- Rails template: https://github.com/navapbc/template-application-rails
