---
name: build-strata-rails-app
description: Scaffolds a Nava Strata Rails application with the nava-platform CLI and navapbc/template-application-rails template, then optionally installs the Strata SDK. Use when user says build a strata app, scaffold a rails app, or apply the rails template.
---

# Build Strata Rails App

## Overview

Scaffolds a new Nava Strata application in the user's current project directory using `nava-platform app install` with the Rails application template, runs the app's make targets to verify it compiles and tests pass, then offers to install the Strata SDK.

Most non-interactive command sequences are delegated to scripts in this skill's `scripts/` directory so each phase runs in a single turn. Each script prints labeled status lines and a final marker; read the marker to decide the next move. Interactive steps (confirm intent, ask for the app name, Ruby version-manager choice) stay with the model.

**`<SKILL_DIR>`** = the absolute path to this skill's directory (the folder containing this `SKILL.md`). Every script invocation below uses `<SKILL_DIR>/scripts/...` so it resolves regardless of the current working directory — including when you've `cd`-ed into the generated app. The scripts themselves act on the current working directory, so always `cd` to the right place first as each step directs.

**Supported templates (currently):** Rails only.

## Step 1: Confirm intent

Ask the user exactly this:

> **Are you trying to build a Strata app? (reply "skip" to exit, otherwise say yes)**

- If reply is "skip" / "no" / "exit" / anything declining → stop the skill. Do not proceed. Do not run any commands.
- If reply confirms → proceed to Step 2.

## Step 2: Preflight checks

Run the preflight script from the current working directory (the user's project root):

```sh
sh <SKILL_DIR>/scripts/preflight.sh
```

It checks (and where safe, fixes) the Nava Platform CLI, the Docker daemon, the Postgres port, and the git repo. Read the final marker:

- **`PREFLIGHT_OK`** → all checks passed. Proceed to Step 3.
- **`NEEDS_UV`** → `uv` is required to install the CLI and is missing (or the install didn't land on `$PATH`). Tell the user to install `uv` (https://docs.astral.sh/uv/getting-started/installation/) or restart their shell, then stop. Do not attempt pipx/nix/docker without user confirmation.
- **`NEEDS_DOCKER`** → ask the user to start Docker Desktop, then re-run the script.
- **`NEEDS_PORT_FREE`** → port 5432 is held by a process the script won't auto-stop (native `postgres` or unknown). Relay the printed message (e.g. `brew services stop postgresql@16`), wait for the user to free the port, then re-run the script.

The script auto-stops a Docker container occupying 5432 and runs `git init` if the directory isn't a repo — no action needed for those.

## Step 3: Ask for the app name

Ask the user:

> **What should the app be called?** (lowercase letters, digits, dashes, underscores only — e.g. `my-super-awesome-app`)

Store the answer as `<APP_NAME>`. (The install script re-validates the name, so don't worry about edge cases here.)

## Step 4: Install the app

Run the install script with the chosen name from the project root:

```sh
sh <SKILL_DIR>/scripts/install-app.sh <APP_NAME>
```

Read the final marker:

- **`INSTALL_OK <APP_NAME>`** → the `<APP_NAME>/` subdirectory was created. Proceed to Step 5.
- **`INVALID_NAME`** → the name has illegal characters. Go back to Step 3 and ask again.
- **`DIR_EXISTS`** → a directory named `<APP_NAME>/` already exists. Warn the user that installing into it may cause conflicts; ask them to rename/remove it or pick a different name, then re-run.
- **`INSTALL_FAILED`** → report the exact CLI error printed above the marker and stop.

## Step 5: Enter the generated app directory

Check the current working directory:

```sh
pwd
```

- If the output **already ends with** `<APP_NAME>` → you're inside the app directory. Proceed to Step 6.
- Otherwise → `cd <APP_NAME>`.

All subsequent steps must run from inside `<APP_NAME>/`.

## Step 6: Verify Ruby version

The generated app pins a Ruby version. The make targets in Step 7 will fail confusingly if the active Ruby doesn't match. This step is interactive (the user must say which version manager they use), so it is **not** scripted.

**Follow the shared reference: [`references/ruby-version-check.md`](references/ruby-version-check.md)**.

It walks through reading `.ruby-version` / `Gemfile` / `.tool-versions`, comparing against `ruby -v`, asking which version manager the user uses (rbenv / asdf / rvm / chruby / other), installing + activating the required version, and verifying `bundle -v`.

`<RAILS_DIR>` in the reference = the `<APP_NAME>/` directory you entered in Step 5. Do not proceed to Step 7 until `ruby -v` matches the required version and `bundle -v` succeeds.

## Step 7: Verify the app

From inside `<APP_NAME>/`, run the verify script (it acts on the current directory, so the `cd` from Step 5 matters):

```sh
sh <SKILL_DIR>/scripts/verify-app.sh
```

It runs, in order, `make .env` → `make init-db` → `make build` → `make precompile-assets` → `make lint` → `make test`, stopping at the first failure. Read the final marker:

- **`VERIFY_OK`** → the app compiled and tests pass. Proceed to Step 8.
- **`VERIFY_FAILED <target>`** → report the named target and the error output above the marker, then stop.

**Note:** later targets may show deprecation warnings (e.g. "Passing nil to :model argument"). These are expected with fresh templates and do not indicate failure.

## Step 8: Report success

Tell the user:

> **App is ready.** Run `make start-container` from inside `<APP_NAME>/`, then visit http://localhost:3000

Then proceed to Step 9.

## Step 9: Offer the Strata SDK

Ask the user:

> **Do you also want to install the Strata Government Digital Services SDK? (reply "yes", or "skip" to finish)**

- If reply declines → done. The skill is complete.
- If reply confirms → from inside `<APP_NAME>/`, run:

  ```sh
  sh <SKILL_DIR>/scripts/add-strata-sdk.sh
  ```

  This appends the Strata gem lines to the `Gemfile`, bundles (`make build`), and re-runs `make lint` and `make test`. Read the final marker:

  - **`SDK_OK`** → SDK installed, Gemfile updated, lint + test still green. Report success.
  - **`SDK_ALREADY_PRESENT`** → the Gemfile already references the strata gem; nothing to do. Tell the user.
  - **`SDK_FAILED <step>`** → report the named step (`build` / `lint` / `test`) and the error output above the marker, then stop.

## Common pitfalls

| Problem | Fix |
|---------|-----|
| `NEEDS_UV` from preflight | Ensure `~/.local/bin` (or uv tool install path) is on `$PATH`; user may need to restart shell. Install `uv` if missing. |
| `NEEDS_DOCKER` from preflight | Docker daemon not running — ask user to start Docker Desktop, re-run preflight. |
| `NEEDS_PORT_FREE` from preflight | Native Postgres or another process holds 5432 — free it (e.g. `brew services stop postgresql@16`) then re-run. |
| `Makefile` merge conflict during `app install` | Usually accept the app template's Makefile version (per platform-cli docs on adding-an-app). |
| User asks for Next.js / Python-Flask | Stop. This skill only supports Rails. Direct them to manual CLI usage. |
| `VERIFY_FAILED build` with Docker errors | Docker daemon not running — start Docker Desktop and re-run. |

## Reference

- Platform CLI docs: https://github.com/navapbc/platform-cli
- Rails template: https://github.com/navapbc/template-application-rails
- Strata SDK Rails engine: https://github.com/navapbc/strata-sdk-rails
