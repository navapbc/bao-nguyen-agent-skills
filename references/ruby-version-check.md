# Ruby Version Check (shared reference)

**Purpose:** verify the active Ruby matches what a Rails project requires before installing gems or running generators. Mismatched Ruby is a common cause of confusing `bundle install` and `bin/rails` failures.

**Used by:** any skill that touches a Rails project's gems, runs Rails generators, or runs `make test` / `make lint`. Reference this file from `<RAILS_DIR>` (the located Rails app directory) — all paths below are relative to it.

## Step A: Determine the required version

Check, in order:

1. `<RAILS_DIR>/.ruby-version` (one line, e.g. `3.3.4`)
2. `<RAILS_DIR>/Gemfile` for a `ruby "X.Y.Z"` line
3. `<RAILS_DIR>/.tool-versions` for a `ruby X.Y.Z` line (asdf)

Save the required version as `<REQUIRED_RUBY>`. If none of those files specify a Ruby version, skip the rest — there is no version to enforce.

## Step B: Compare against the active Ruby

```sh
ruby -v
```

If the major.minor.patch matches `<REQUIRED_RUBY>` → done. Continue with the calling skill.

If it does not match → continue to Step C.

## Step C: Ask which version manager the user uses

> **Your active Ruby is `<active>` but the project requires `<REQUIRED_RUBY>`. Which Ruby version manager do you use? (rbenv / asdf / rvm / chruby / other)**

## Step D: Switch to the required version

First check whether the version is installed; if not, install it. Then activate it.

| Manager | Check installed | Install if missing | Activate |
|---------|-----------------|--------------------|----------|
| **rbenv** | `rbenv versions \| grep -q <REQUIRED_RUBY>` | `rbenv install <REQUIRED_RUBY>` | `rbenv local <REQUIRED_RUBY>` (run inside `<RAILS_DIR>`) |
| **asdf** | `asdf list ruby \| grep -q <REQUIRED_RUBY>` | `asdf install ruby <REQUIRED_RUBY>` | `asdf local ruby <REQUIRED_RUBY>` (run inside `<RAILS_DIR>`) |
| **rvm** | `rvm list strings \| grep -q <REQUIRED_RUBY>` | `rvm install <REQUIRED_RUBY>` | `rvm use <REQUIRED_RUBY>` |
| **chruby** | `chruby \| grep -q <REQUIRED_RUBY>` | install via `ruby-install <REQUIRED_RUBY>` (tell user if `ruby-install` is missing) | `chruby <REQUIRED_RUBY>` |
| **other / unsure** | — | — | Stop. Ask the user to switch manually, then confirm before continuing. |

Notes:

- `rbenv install` / `asdf install ruby` may take several minutes (compiling Ruby). Tell the user before running.
- After activating, **re-run `ruby -v`** to confirm. If still mismatched (shell hasn't picked up the new version), stop and ask the user to open a new shell or `source` their rc file.
- Do not run `sudo` for any of these — version managers are per-user.

## Step E: Verify Bundler is available

```sh
bundle -v
```

If `bundle` is missing → `gem install bundler`. Then continue with the calling skill.

## Common pitfalls

| Problem | Fix |
|---------|-----|
| `ruby -v` still old after `rbenv local` | Open a new shell, or run `eval "$(rbenv init -)"` in current shell |
| `asdf install ruby <ver>` fails with build errors | User missing build deps (openssl, readline). Direct them to asdf-ruby README. |
| Multiple version managers installed (e.g. rbenv + asdf) | Ask which one is authoritative; mixing causes silent shadowing |
| `.ruby-version` and `Gemfile` disagree | `.ruby-version` wins for the version manager; Gemfile `ruby` line is enforced by Bundler. Ask user to reconcile. |
