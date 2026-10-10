---
sidebar_position: 10
slug: advanced-workflows
---

# Advanced workflows

Push Karakeep further with automation and integrations.

## Rule engine

- Create if-this-then-that style rules to auto-tag, favourite, or route bookmarks into lists based on metadata or content.
- Useful for keeping inboxes tidy (e.g. auto-archive newsletters, auto-tag domains, or flag videos).

### Skip AI tagging for selected bookmarks

To keep RSS imports from generating AI tags while still tagging manually saved bookmarks, create an enabled rule in **Settings → Rules**:

- Event: **Before AI tagging**.
- Condition: **Bookmark source is**, with **RSS** as the source.
- Action: **Skip AI Tagging**.

The rule is evaluated by the tagging worker before it calls the AI model. You can use other conditions, such as a URL or title match, to select which bookmarks to exclude. The skip action is only valid with the **Before AI tagging** event; a **Bookmark added** rule runs asynchronously and cannot reliably prevent tagging.

This skips the current tagging attempt, including a re-tagging request while the rule still matches. It does not remove existing tags or disable AI summaries. Disable or change the rule before requesting AI tags for an excluded bookmark. Global and user-level AI tagging settings still apply.

## API

- Use the API to script imports, syncs, or custom tools. Same surface area the apps use.
- Great for integrating with personal scripts, cron jobs, or other services.

## Webhooks

- Subscribe to bookmark events and trigger your own systems when something is added, updated, or archived.
- Pair with the API to build end-to-end automations (e.g. push new saves into a writing queue or a team chat).
