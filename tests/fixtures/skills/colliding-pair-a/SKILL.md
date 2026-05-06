---
name: colliding-pair-a
description: Sends a Slack message to a channel with formatted content and link previews.
---

# Colliding Pair A

Skill: `colliding-pair-a`. This skill sends a Slack message to a channel.

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
