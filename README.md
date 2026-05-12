# bao-nguyen-agent-skills

Agent skills for use with [Claude Code](https://claude.ai/code) and other AI coding agents.

## Install

Add all skills from this repo:

```bash
npx skills add https://github.com/navapbc/bao-nguyen-agent-skills
```

Install a specific skill:

```bash
npx skills add https://github.com/navapbc/bao-nguyen-agent-skills --skill hello-world
```

Install globally (available across all projects):

```bash
npx skills add https://github.com/navapbc/bao-nguyen-agent-skills -g -a claude-code
```

Preview available skills without installing:

```bash
npx skills add https://github.com/navapbc/bao-nguyen-agent-skills --list
```

## Uninstall

Remove a specific skill:

```bash
npx skills remove hello-world
```

## Updating

Update skills:

```bash
npx skills update
```

## Available Skills

| Skill | Description |
|-------|-------------|
| `build-strata-rails-app` | Scaffolds a new Nava Strata application using nava-platform CLI and the navapbc/template-application-rails template |
| `build-strata-sdk-model` | Adds a single Rails model to an existing Rails app — plain ActiveRecord, or a Strata SDK variant (application form, case, business process) |
| `build-strata-app-form-views` | Builds views, flow, and routes for a Strata multi-page application form on top of an existing ApplicationForm model |

## Learn more

- [`skills` CLI on npm](https://www.npmjs.com/package/skills)
- [Skills framework source](https://github.com/vercel-labs/skills)
