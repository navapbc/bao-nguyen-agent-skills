---
name: build-strata-rails-app
description: Scaffolds a new Nava Strata application using nava-platform CLI and the navapbc/template-application-rails template. Use when user says build a strata app, scaffold a rails app, apply the rails template, or start a new Strata Rails project.
---

# Build Strata Rails App

## Overview 

Scaffolds a new Nava Strata application in the user's current project directory using `nava-platform app install` with the Rails application template, then runs the app's make targets to verify it compiles and tests pass.

**Supported templates (currently):** Rails only.

## Step 1: Confirm intent

Ask the user exactly this:

> **Are you trying to build a Strata app? (reply "skip" to exit, otherwise say yes)**

- If reply is "skip" / "no" / "exit" / anything declining → stop the skill. Do not proceed. Do not run any commands.
- If reply confirms → proceed to Step 2.

## Step 2: Check / install Nava Platform CLI

Check whether `nava-platform` is installed:

```sh
nava-platform --help
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

After install, re-run `nava-platform --help` to verify. If still failing, stop and report the error to the user.

## Step 3: Check Docker daemon, Postgres port, and ensure current directory is a git repository

First, verify Docker is running:

```sh
docker ps
```

- If the command succeeds → Docker daemon is running, proceed.
- If the command fails (socket error, daemon not running) → ask user to start Docker Desktop, then retry.

**Check for Postgres port (5432) conflicts:**

Check if anything is listening on port 5432:

```sh
lsof -iTCP:5432 -sTCP:LISTEN -t
```

- If the output is **empty** → port is free, proceed.
- If the output is **NOT empty** → something is using the port. Determine what it is:

  ```sh
  lsof -iTCP:5432 -sTCP:LISTEN
  ```

  Inspect the `COMMAND` column of the output:

  - **If the command is `com.docke` / `docker` / `docker-proxy`** → a Docker container is occupying the port. Stop it:
    ```sh
    docker stop $(docker ps --filter "publish=5432" -q)
    ```
  - **If the command is `postgres`** → a native PostgreSQL instance is running (likely via Homebrew or a system package). **Do NOT stop it automatically.** Tell the user:
    > A local PostgreSQL server is already running on port 5432. Please stop it before continuing. For Homebrew: `brew services stop postgresql@16` (adjust the version if needed). Then re-run this step.

    Stop and wait for the user to confirm they have freed the port.
  - **If the command is something else** → report the process name to the user and ask them to free port 5432 manually. Stop and wait for confirmation.

Then check git status:

```sh
git rev-parse --is-inside-work-tree
```

- If it prints `true` → already a git repo, proceed.
- If it errors → current dir is not a git repo. Run `git init` in the current working directory, then proceed.

**Do NOT** run `git init` if the directory already is inside a git repo — it would be redundant.

## Step 4: Ask for the app name

Ask the user:

> **What should the app be called?** (lowercase letters, digits, dashes, underscores only — e.g. `my-super-awesome-app`)

Validate the answer matches `^[a-z0-9_-]+$`. If not, ask again.

Store the answer as `<APP_NAME>`.

## Step 5: Check for existing app directory

Before applying the template, verify that a directory named `<APP_NAME>/` does **not** already exist in the current working directory:

```sh
test -d <APP_NAME>
```

- If the directory **does NOT exist** (command exits non-zero) → proceed to Step 6.
- If the directory **already exists** (command exits zero) → warn the user:
  > A directory named `<APP_NAME>/` already exists. Installing the template into an existing directory may cause conflicts. Please rename or remove it first, then confirm to continue.

  Stop and wait for the user to resolve before proceeding.

## Step 6: Apply the Rails template

The template installation requires **interactive terminal input** (Bash tool runs in non-interactive mode, so Claude cannot run this directly).

**Tell the user to run this command in their terminal** (copy-paste ready):

```sh
nava-platform app install --template-uri https://github.com/navapbc/template-application-rails . <APP_NAME>
```

This creates a `<APP_NAME>/` subdirectory containing the generated Rails app. When prompted, provide answers for template configuration (or accept defaults). If the command fails, report the exact error.

**After running**, proceed to Step 7 once the directory is created.

## Step 7: Proceed into the generated app directory

After `nava-platform app install` completes, check the current working directory:

```sh
pwd
```

- If the output **already ends with** `<APP_NAME>` (e.g. `/Users/me/my-project/<APP_NAME>`) → you are already inside the app directory. Proceed to Step 8.
- If the output does **NOT** end with `<APP_NAME>` (e.g. `/Users/me/my-project`) → you are still in the project root. Change into the app directory:
  ```sh
  cd <APP_NAME>
  ```

All subsequent commands in Step 8 must run from inside `<APP_NAME>/`.

## Step 8: Prepare and verify the app

Run the following make targets **in order** from inside the `<APP_NAME>/` directory. Each must succeed before running the next:

1. `make .env` — generate the local `.env` file
2. `make init-db` — create and initialize test database
3. `make build` — build the container image
4. `make precompile-assets` — precompile Rails assets
5. `make lint` — run linters (rubocop etc.)
6. `make test` — run the rspec test suite

If any step fails, stop and report the exact error to the user. Do not proceed to later steps on failure.

**Note:** Steps 4-6 may show deprecation warnings (e.g., "Passing nil to :model argument"). These are expected with fresh templates and do not indicate failure.

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
| Running `nava-platform app install` outside a git repo | `copier` requires git |

## Reference

- Platform CLI docs: https://github.com/navapbc/platform-cli
- Rails template: https://github.com/navapbc/template-application-rails
