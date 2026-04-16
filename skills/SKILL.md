---
name: karakeep
description: Official skill for how to use karakeep (the bookmark manager) and interact with it programmatically.
metadata:
  tags: bookmarks, bookmark manager, 2nd brain, productivity
  openclaw:
    envVars:
      - name: KARAKEEP_API_KEY
        required: true
        description: The API key for your Karakeep instance
      - name: KARAKEEP_SERVER_ADDR
        required: false
        description: The server address for your Karakeep instance.
    requires:
      env:
        - KARAKEEP_API_KEY
        - KARAKEEP_SERVER_ADDR
      bins:
        - karakeep
    homepage: https://karakeep.app
    links:
      repository: https://github.com/karakeep-app/karakeep
      documentation: https://docs.karakeep.app
    emoji: 📦
    cliHelp: karakeep --help
    install:
      - kind: node
        package: "@karakeep/cli"
        bins: [karakeep]
---

# Karakeep

Karakeep is an open source self-hosted bookmark manager for collecting, organizing, and searching content. This skill covers the core concepts and how to interact with Karakeep via the CLI.

## When to use

Use this skill when the user wants to interact with their Karakeep instance (adding bookmarks, managing lists/tags, searching, etc.).

## Core Concepts

### Bookmarks

- **Bookmarks**: Core entity in Karakeep. Can be one of links, text or media.
  - **Links**: Save URLs — Karakeep auto-fetches title, description, image, screenshot, and full-page archive.
  - **Text**: Quick notes or text snippets stored as bookmarks.
  - **Media**: Images and PDFs uploaded directly.
- **Favorites**: Star bookmarks for quick access.
- **Archiving**: Hide bookmarks from the homepage while keeping them searchable.
- **Notes**: Attach personal context notes to any bookmark.
- **Highlights**: Save quotes, summaries, or TODOs while reading — searchable across all bookmarks.

### Lists

- **Manual lists**: Curated collections organized by project or topic. Can be private or public.
- **Smart lists**: Auto-updating lists powered by search queries (e.g., `#ai -archived`).
- **Collaboration**: Invite editors (can add bookmarks) or viewers (read-only) to a list.

### Tags

Lightweight labels for any bookmark (topics, sources, workflow states). Multiple tags per bookmark, tags travel with bookmarks across lists. AI can auto-generate tags when configured.

### Search Query Language

Karakeep has a powerful search query language for finding the right bookmarks. It supports full-text search, boolean logic, qualifiers, and more.

#### Basic Syntax

- Spaces between conditions act as implicit AND.
- Use `and` / `or` keywords for explicit boolean logic.
- Prefix any qualifier with `-` or `!` to negate it (e.g., `-is:archived`, `!is:fav`).
- Use parentheses `()` for grouping (note: groups themselves can't be negated).
- Any text not part of a qualifier is treated as full-text search (e.g., `machine learning is:fav`).

#### Qualifiers

| Qualifier | Description | Example |
|-----------|-------------|---------|
| `is:fav` | Favorited bookmarks | `is:fav` |
| `is:archived` | Archived bookmarks | `-is:archived` |
| `is:tagged` | Bookmarks with one or more tags | `is:tagged` |
| `is:inlist` | Bookmarks in one or more lists | `is:inlist` |
| `is:link` | Link bookmarks | `is:link` |
| `is:text` | Text/note bookmarks | `is:text` |
| `is:media` | Media bookmarks (images/PDFs) | `is:media` |
| `is:broken` | Bookmarks with failed crawls or non-2xx status codes | `is:broken` |
| `url:<value>` | Match URL substring | `url:github.com` |
| `title:<value>` | Match title substring (supports quoted strings) | `title:rust`, `title:"my title"` |
| `#<tag>` or `tag:<tag>` | Match bookmarks with specific tag (supports quoted strings) | `#important`, `tag:"work in progress"` |
| `list:<name>` | Match bookmarks in a specific list (supports quoted strings) | `list:reading`, `list:"to review"` |
| `after:<date>` | Created on or after date (YYYY-MM-DD) | `after:2024-01-01` |
| `before:<date>` | Created on or before date (YYYY-MM-DD) | `before:2024-12-31` |
| `age:<time-range>` | Filter by creation age. Use `<` / `>` for max/min age. Units: `d` (days), `w` (weeks), `m` (months), `y` (years) | `age:<1d`, `age:>2w`, `age:<6m` |
| `feed:<name>` | Bookmarks imported from a specific RSS feed | `feed:Hackernews` |
| `source:<value>` | Match by capture source. Values: `api`, `web`, `cli`, `mobile`, `extension`, `singlefile`, `rss`, `import` | `source:rss`, `-source:web` |

#### Examples

```
# Favorited bookmarks from 2024 tagged "important"
is:fav after:2024-01-01 before:2024-12-31 #important

# Archived bookmarks in "reading" list or tagged "work"
is:archived and (list:reading or #work)

# Untagged or unorganized bookmarks
-is:tagged or -is:inlist

# Recent bookmarks from the last week
age:<1w

# Full-text search combined with qualifiers
machine learning is:fav -is:archived
```

### RSS Feeds

Karakeep can also be used to consume RSS feeds, but also can itself act as an RSS feed publisher.
- **Publishing**: Export any list as an RSS feed with a unique token.
- **Consuming**: Auto-monitor external RSS feeds and create bookmarks from new items (hourly, with duplicate detection).

### Automation

- **Rule Engine**: If-this-then-that rules to auto-tag, favorite, or route bookmarks to lists.
- **Webhooks**: Subscribe to bookmark events (add/update/archive).

## Interacting with Karakeep via the CLI

### Installation

```bash
npm install -g @karakeep/cli
```

Or via Docker:

```bash
docker run --rm ghcr.io/karakeep-app/karakeep-cli:release --help
```

### Authentication

The CLI requires an API key and server address. Get the API key from your Karakeep instance's settings page.

**Option 1 — Environment variables (recommended):**

```bash
export KARAKEEP_API_KEY="your-api-key"

# If self-hosted, pass the server address as well. It defaults to the cloud instance if not set:
export KARAKEEP_SERVER_ADDR="https://cloud.karakeep.com"
```

**Option 2 — CLI flags:**

```bash
karakeep --api-key <key> --server-addr <addr> <command>
```

**Verify authentication:**

```bash
karakeep whoami
```

### Bookmark Commands

Run `karakeep --help` to see all available commands, but the most important ones are:

```bash
# Add a link bookmark
karakeep bookmarks add --link "https://example.com"

# Add a link with tags and to a specific list
karakeep bookmarks add --link "https://example.com" --tag-name "reading" --list-id <list-id>

# Add a text bookmark
karakeep bookmarks add --note "Remember to review the PR"

# Get bookmark details
karakeep bookmarks get <bookmark-id>
karakeep bookmarks get <bookmark-id> --include-content

# Update a bookmark
karakeep bookmarks update <bookmark-id> --title "New Title"
karakeep bookmarks update <bookmark-id> --archive
karakeep bookmarks update <bookmark-id> --favourite
karakeep bookmarks update-tags <bookmark-id> --add-tag "important"
karakeep bookmarks update-tags <bookmark-id> --remove-tag "old-tag"

# List management
karakeep lists list
karakeep lists get --list <list-id>
karakeep lists add-bookmark --list <list-id> --bookmark <bookmark-id>
karakeep lists remove-bookmark --list <list-id> --bookmark <bookmark-id>
karakeep lists delete <list-id>


# List all bookmarks
karakeep bookmarks list

# Search bookmarks
karakeep bookmarks search "is:fav #work"
karakeep bookmarks search "rust" --limit 10 --sort-order relevance
karakeep bookmarks search "is:tagged" --all   # paginate through all results

# Delete a bookmark
karakeep bookmarks delete <bookmark-id>
```

You can always pass `--json` to get raw JSON output instead of pretty-printed output.
