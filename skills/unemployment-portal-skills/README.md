This folder includes three files used to generated starter unemployment portals (could be easily adapted for other benefit portal types as well). 

1. unemployment-intake-schema.json - describes the data model as well as validation rules and conditional logic
2. unemployment-portal-guidelines/SKILL.md - general engineering guidelines (ARPA guidance, plain language, localization etc)
3. unemployment-intake-form/SKILL.md - form generator skill 

## Usage
These are Claude Code skills. To use them:
  1. Copy the two SKILL.md folders into `~/.claude/skills/`
  2. Place the schema JSON somewhere the skills can reference it                                                                                
  3. Ask Claude to generate an unemployment portal — it will ask for your tech stack 

## Supported stacks

So far we have used these SKILLS for both rails and strata as well as typescript and python projects. Try some more!

-Ali Glenesk