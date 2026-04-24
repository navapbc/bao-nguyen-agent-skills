# bao-nguyen-agent-skills

Agent skills for use with [Claude Code](https://claude.ai/code) and other AI coding agents.

## Install

Add all skills from this repo:

```bash
npx skills add bao-nguyen/bao-nguyen-agent-skills
```

Install a specific skill:

```bash
npx skills add bao-nguyen/bao-nguyen-agent-skills --skill hello-world
```

Install globally (available across all projects):

```bash
npx skills add bao-nguyen/bao-nguyen-agent-skills -g -a claude-code
```

Preview available skills without installing:

```bash
npx skills add bao-nguyen/bao-nguyen-agent-skills --list
```

## Available Skills

| Skill | Description |
|-------|-------------|
| `hello-world` | Print "Hello World" in 10 different languages |
| `build-strata-rails-app` | Scaffold a new Nava Strata Rails app using nava-platform CLI |

## Learn more

- [`skills` CLI on npm](https://www.npmjs.com/package/skills)
- [Skills framework source](https://github.com/vercel-labs/skills)
