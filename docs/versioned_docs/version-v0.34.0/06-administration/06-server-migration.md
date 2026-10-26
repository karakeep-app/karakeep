# Migrating Between Servers

This guide explains how to migrate all of your data from one Karakeep server to another using the official CLI.

## What the command does

The migration copies user-owned data from a source server to a destination server in this order:

- User settings
- Lists (preserving hierarchy and settings)
- RSS feeds
- AI prompts (custom prompts and their enabled state)
- Webhooks (URL and events)
- Tags (ensures tags by name exist)
- Rule engine rules (IDs remapped to destination equivalents)
- Bookmarks (links, text, and assets)
  - After creation, attaches the correct tags and adds to the correct lists

Notes:
- Webhook tokens cannot be read via the API, so tokens are not migrated. Re‑add them on the destination if needed.
- Asset bookmarks are migrated by downloading the original asset and re‑uploading it to the destination. Only images and PDFs are supported for asset bookmarks.
- Link bookmarks on the destination may be de‑duplicated if the same URL already exists.

## Prerequisites

- Install the CLI:
  - NPM: `npm install -g @karakeep/cli`
  - Docker: `docker run --rm ghcr.io/karakeep-app/karakeep-cli:release --help`
- Collect API keys and base URLs for both servers:
  - Source: `--server-addr`, `--api-key`
  - Destination: `--dest-server`, `--dest-api-key`

## Quick start

```
karakeep --server-addr https://src.example.com --api-key <SOURCE_API_KEY> migrate \
  --dest-server https://dest.example.com \
  --dest-api-key <DEST_API_KEY>
```

The command is long‑running and shows live progress for each phase. You will be prompted for confirmation; pass `--yes` to skip the prompt.

### Options

- `--server-addr <url>`: Source server base URL
- `--api-key <key>`: API key for the source server
- `--dest-server <url>`: Destination server base URL
- `--dest-api-key <key>`: API key for the destination server
- `--batch-size <n>`: Page size for bookmark migration (default 50, max 100)
- `-y`, `--yes`: Skip the confirmation prompt

## What to expect

- Lists are recreated parent‑first and retain their hierarchy.
- Feeds, prompts, webhooks, and tags are recreated by value.
- Rules are recreated after IDs (tags, lists, feeds) are remapped to their corresponding destination IDs.
- After each bookmark is created, the command attaches the correct tags and adds it to the correct lists.

## Caveats and tips

- Webhook auth tokens must be re‑entered on the destination after migration.
- If your destination already contains data, duplicate links may be de‑duplicated; tags and list membership are still applied to the existing bookmark.

## Troubleshooting

- If the command exits early, you can re‑run it, but note:
  - Tags and lists that already exist are reused.
  - Link de‑duplication avoids duplicate link bookmarks. Notes and assets will get re-created.
  - Rules, webhooks, rss feeds will get re-created and you'll have to manually clean them up afterwards.
  - The progress log indicates how far it got.
- Use a smaller `--batch-size` if your source or destination is under heavy load.
