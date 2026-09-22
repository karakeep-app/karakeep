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

This is one-way: once upgraded, the old version can't open the data anymore. If you want a safety net, back up the meilisearch volume first.

If you'd rather not migrate, you can also wipe the meilisearch volume and trigger a re-index from the admin panel — the search index is fully rebuildable from the main database.
