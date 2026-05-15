---
name: heroku-rails-deploy
description: Guides deploying a Strata Rails application to Heroku, covering Node.js and Ruby buildpack ordering, git-subtree push for subdirectory repos, DATABASE_URL migration, AWS startup errors, and Cognito auth adapter bypass.
---

# Heroku Rails Deploy

## Overview

Deploys a Strata Rails app to Heroku from a clean state to a running dyno. Covers all non-obvious gotchas specific to Strata apps (Cognito auth, AWS SDK initialization, StaffController eager-loading).

**Announce at start:** "Using heroku-rails-deploy skill to deploy to Heroku."

---

## Step 1: Verify Heroku CLI Login

```bash
heroku auth:whoami
```

If not logged in, instruct the user: `! heroku login` (interactive — must run in user's terminal).

---

## Step 2: Identify Repo Structure

Determine whether the Rails app sits at the git root or in a subdirectory:

```bash
git -C <app-path> rev-parse --git-dir
```

| Result | Structure | Deploy strategy |
|--------|-----------|-----------------|
| `<app-path>/.git` | App is git root | `git push heroku main` |
| `<parent>/.git` | App is subdirectory | `git subtree push --prefix <subdir> heroku main` |

**Remember the subdirectory name** — used in Step 8.

---

## Step 3: Make Required Code Changes

### 3a. Create Procfile (if missing)

```
web: bundle exec puma -C config/puma.rb
```

### 3b. Update `config/database.yml` production section

Replace any AWS RDS IAM auth config with:

```yaml
production:
  url: <%= ENV['DATABASE_URL'] %>
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
  sslmode: require
```

Remove `aws_rds_iam_auth_token_generator: default` — it crashes on Heroku Postgres.

### 3c. Switch Active Storage to local (if set to `:amazon`)

In `config/environments/production.rb`:

```ruby
config.active_storage.service = :local
```

S3 requires a provisioned bucket and credentials not available on Heroku.

### 3d. Create `StaffController` (if controllers inherit from it)

```bash
grep -r "< StaffController" app/controllers/
```

If results exist and `app/controllers/staff_controller.rb` is missing, create it:

```ruby
# frozen_string_literal: true
class StaffController < Strata::StaffController
end
```

**Why:** Production Rails eager-loads all files. Missing intermediate base classes crash at boot even if development lazy-loading works fine.

### 3e. Commit all changes

```bash
git add Procfile config/database.yml config/environments/production.rb \
  app/controllers/staff_controller.rb
git commit -m "chore: prepare app for Heroku deployment"
```

---

## Step 4: Create Heroku App

```bash
heroku apps:create [optional-app-name]
```

Note the app name and git remote URL from output.

**If the app is in a subdirectory** (Step 2), the `heroku` remote was added to the wrong directory. Add it manually to the parent repo:

```bash
git -C <parent-repo-root> remote add heroku https://git.heroku.com/<app-name>.git
```

---

## Step 5: Provision Postgres

```bash
heroku addons:create heroku-postgresql:essential-0 --app <app-name>
```

Heroku sets `DATABASE_URL` automatically — Rails picks it up via `config/database.yml`.

---

## Step 6: Add Buildpacks (Order Matters)

```bash
heroku buildpacks:add heroku/nodejs --app <app-name>
heroku buildpacks:add heroku/ruby --app <app-name>
heroku buildpacks --app <app-name>   # verify: nodejs first, ruby second
```

**Why Node.js first:** `cssbundling-rails` runs `css:install` during `assets:precompile`, which requires npm. Adding Node.js with `--index 1` after the fact silently drops the Ruby buildpack — always add both explicitly.

---

## Step 7: Set Config Vars

```bash
# App won't boot in production without a secret key
SECRET=$(ruby -e "require 'securerandom'; puts SecureRandom.hex(64)")
heroku config:set SECRET_KEY_BASE="$SECRET" --app <app-name>

# AWS SDK loads at startup and requires a region even if AWS features aren't used
heroku config:set AWS_REGION=us-east-1 --app <app-name>

# Bypass Cognito — use mock adapter for non-AWS deployments
heroku config:set AUTH_ADAPTER=mock --app <app-name>
```

**`AUTH_ADAPTER` values:**
- `mock` — no AWS required, accepts any credentials, auto-creates users on first login
- `cognito` — requires `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`, `COGNITO_USER_POOL_ID`

---

## Step 8: Deploy

**App at git root:**
```bash
git push heroku main
```

**App in subdirectory `<subdir>/` inside parent repo:**
```bash
git -C <parent-repo-root> subtree push --prefix <subdir> heroku main
```

Watch for `Released vN` and `deployed to Heroku` at the end. If asset precompile fails, check Common Pitfalls.

---

## Step 9: Post-Deploy

```bash
heroku ps:scale web=1 --app <app-name>
heroku run rake db:migrate --app <app-name>
heroku open --app <app-name>
```

Verify the dyno is `up` (not `crashed`):

```bash
heroku ps --app <app-name>
heroku logs --num 30 --app <app-name>
```

---

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `cssbundling-rails: No suitable tool found` | Node.js buildpack missing | Add `heroku/nodejs` before `heroku/ruby` (Step 6) |
| `/usr/bin/env: 'ruby': No such file or directory` on `heroku run` | Ruby buildpack dropped when Node added with `--index 1` | Remove all buildpacks, re-add both explicitly (Step 6) |
| `uninitialized constant StaffController` on boot | Missing base controller; production eager-loads everything | Create `app/controllers/staff_controller.rb` (Step 3d) |
| `Aws::Errors::MissingRegionError` on boot | AWS SDK requires a region even when not actively used | Set `AWS_REGION=us-east-1` (Step 7) |
| `ArgumentError: missing required option :name` from S3 | Active Storage set to `:amazon` with no bucket configured | Switch to `:local` in `production.rb` (Step 3c) |
| `TypeError: no implicit conversion of nil into String` in `CognitoAdapter` | `COGNITO_CLIENT_ID`/`COGNITO_CLIENT_SECRET` not set | Set `AUTH_ADAPTER=mock` (Step 7) |
| `git push` rejected, "not in a git directory" | App is in a subdirectory; heroku remote points to wrong repo | Use `git subtree push` from parent repo (Step 8) |
| `Everything up-to-date` on subtree push after empty commit | Empty commit doesn't change subtree content | Make a real change inside the app subdirectory before pushing |
| DB connection fails at boot | Production config uses `DB_NAME`/`DB_USER` instead of `DATABASE_URL` | Update `database.yml` production section (Step 3b) |
| Dyno crashes, logs show `require_master_key` | `master.key` missing with `require_master_key = true` | Comment out `require_master_key` in `production.rb`; set `SECRET_KEY_BASE` |
