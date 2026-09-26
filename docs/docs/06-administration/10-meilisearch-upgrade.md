---
title: Upgrading Meilisearch
sidebar_label: Upgrading Meilisearch
---

Meilisearch won't open a database that was written by an older version. If you bump the image version in one go, the container exits with:

```
Your database version (1.41.0) is incompatible with your current engine version (1.53.2).
```

To upgrade an existing install:

1. Stop the meilisearch container.
2. Start it once with `MEILI_UPGRADE_DB=true` (or `--upgrade-db`) on the new image, with the same volume — it upgrades the database during startup.
3. Remove the env var afterwards, it's only needed for the upgrade run.

With the bundled docker compose file, that looks like adding the variable to the meilisearch service:

```yaml
services:
  meilisearch:
    environment:
      MEILI_UPGRADE_DB: "true"
```

then running `docker compose up -d meilisearch`, waiting for the migration to finish in the container logs, removing the variable and running `docker compose up -d meilisearch` again. On Kubernetes, `kubectl set env deployment/meilisearch MEILI_UPGRADE_DB=true` does the same; unset it once the pod has migrated.

This is one-way: once upgraded, the old version can't open the data anymore. If you want a safety net, back up the meilisearch volume first.

If you'd rather not migrate, you can also wipe the meilisearch volume and trigger a re-index from the admin panel (`Admin Settings > Background Jobs > Reindex All Bookmarks`) — the search index is fully rebuildable from the main database. If you're storing embeddings in Meilisearch, they live in the same volume: after wiping it, also run `Regenerate All Bookmark Embeddings` from the same screen to rebuild them.
