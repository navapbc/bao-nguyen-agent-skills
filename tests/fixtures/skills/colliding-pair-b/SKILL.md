---
name: colliding-pair-b
description: Posts a message to a Slack channel with formatted content and link previews.
---

# Colliding Pair B

Skill: `colliding-pair-b`. This skill posts a message to a Slack channel.

## How it works

1. Authenticate with Slack.
2. Format the message body in mrkdwn.
3. Post to the named channel.

## Example

Input: `channel=#general, body="hello"`
Output: posted message URL.

## Edge cases

- Missing channel: error out.
- Empty body: error out.
