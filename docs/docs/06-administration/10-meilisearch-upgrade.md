# Upgrading Meilisearch

Meilisearch won't open a database that was written by an older Meilisearch
version. If you start a newer Meilisearch image on an existing volume, the
container exits with an error like this one:

```
Your database version (1.41.0) is incompatible with your current engine version (1.55.0).
```

Search in Karakeep stops working until the database is upgraded or rebuilt. You
can either migrate the existing database in place, or start from an empty one
and let Karakeep rebuild the index.

If you run a separate Meilisearch instance for embeddings (`MEILI_VECTOR_ADDR`),
upgrade it the same way.

## Upgrading the database in place

Meilisearch can migrate an existing database while it starts. To allow it, set
`MEILI_UPGRADE_DB=true` (or pass `--upgrade-db`) when you start the new version.
Meilisearch versions older than v1.51 call this option
`MEILI_EXPERIMENTAL_DUMPLESS_UPGRADE=true` instead.

The migration is one-way: once it has run, older Meilisearch versions can't open
the data anymore. Back up the Meilisearch volume first if you might want to go
back.

### Docker Compose

1. Change the image tag of the `meilisearch` service to the new version, and add
   the variable to its environment:

   ```diff
    services:
      meilisearch:
        image: getmeili/meilisearch:<new version>
        restart: unless-stopped
        env_file:
          - .env
        environment:
          MEILI_NO_ANALYTICS: "true"
   +      MEILI_UPGRADE_DB: "true"
   ```

2. Run `docker compose up -d meilisearch` and check
   `docker compose logs meilisearch`: Meilisearch should now start listening
   instead of exiting with the error above.
3. Remove `MEILI_UPGRADE_DB` again and run `docker compose up -d meilisearch`.

Leaving the variable set does no harm while the database is up to date, but the
next image change would then migrate the data without asking.

### Kubernetes

Deploy the new image as usual. The Meilisearch pod fails to start with the
error above until you enable the migration:

```bash
kubectl set env deployment/meilisearch MEILI_UPGRADE_DB=true
```

Once the new pod is running, remove the variable again:

```bash
kubectl set env deployment/meilisearch MEILI_UPGRADE_DB-
```

If Flux or Argo CD manages the deployment, set and remove the variable in
your manifests instead — the next reconcile reverts `kubectl set env`.

## Rebuilding the index instead

Karakeep can rebuild the search index from its own database, so you can also
throw away the Meilisearch data:

1. Stop Meilisearch and delete (or rename) the `data.ms` folder in the volume
   mounted at `/meili_data`.
2. Start the new Meilisearch version.
3. Log in to Karakeep as an administrator, go to
   `Admin Settings > Background Jobs` and click `Reindex All Bookmarks`.
4. If embeddings are enabled
   ([`EMBEDDING_ENABLE_AUTO_INDEXING`](../03-configuration/01-environment-variables.md)),
   also click `Regenerate Embeddings for All Bookmarks`. The embeddings were
   stored in the same Meilisearch data, so they are gone as well.

Regenerating embeddings sends every bookmark to your embedding provider again,
which can take a while and cost money on a large collection. The in-place
upgrade keeps the existing embeddings.
