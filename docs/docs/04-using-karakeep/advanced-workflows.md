---
sidebar_position: 10
slug: advanced-workflows
---

# Advanced workflows

Push Karakeep further with automation and integrations.

## Rule engine

- Create if-this-then-that style rules to auto-tag, favourite, or route bookmarks into lists based on metadata or content.
- Useful for keeping inboxes tidy (e.g. auto-archive newsletters, auto-tag domains, or flag videos).
- Rules can also call one of your webhooks, so a bookmark landing in a list can notify another system.

## API

- Use the API to script imports, syncs, or custom tools. Same surface area the apps use.
- Great for integrating with personal scripts, cron jobs, or other services.

## Webhooks

- Subscribe to bookmark events and trigger your own systems when something is added, updated, or archived.
- Pair with the API to build end-to-end automations (e.g. push new saves into a writing queue or a team chat).
- A webhook with no subscribed events is only called by rules that target it, which keeps rule-driven notifications separate from the bookmark events.
