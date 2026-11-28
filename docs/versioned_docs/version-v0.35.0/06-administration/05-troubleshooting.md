# Troubleshooting

## SqliteError: no such table: user

This usually means that there's something wrong with the database setup (more concretely, it means that the database is not initialized). This can be caused by multiple problems:
1. **Wiped DATA_DIR:** Your `DATA_DIR` got wiped (or the backing storage dir changed). If you did this intentionally, restart the container so that it can re-initalize the database.
2. **Missing DATA_DIR**: You're not using the default docker compose file, and you forgot to configure the `DATA_DIR` env var. This will result into the database getting set up in a different directory than the one used by the service.

## Chrome Failed to Read DnsConfig

If you see this error in the logs of the chrome container, it's a benign error and you can safely ignore it. Whatever problems you're having, is unrelated to this error.

## AI Tagging not working (when using OpenAI)

Check the logs of the container and this will usually tell you what's wrong. Common problems are:
1. Typo in the env variable `OPENAI_API_KEY` name resulting into logs saying something like "skipping inference as it's not configured".
2. You forgot to call `docker compose up` after configuring open ai.
3. OpenAI requires pre-charging the account with credits before using it, otherwise you'll get an error like "insufficient funds".

## AI Tagging not working (when using Ollama)

Check the logs of the container and this will usually tell you what's wrong. Common problems are:
1. Typo in the env variable `OLLAMA_BASE_URL` name resulting into logs saying something like "skipping inference as it's not configured".
2. You forgot to call `docker compose up` after configuring ollama.
3. You didn't change the `INFERENCE_TEXT_MODEL` env variable, resulting into karakeep attempting to use gpt models with ollama which won't work.
4. Ollama server is not reachable by the karakeep container. This can be caused by:
    1. Ollama server being in a different docker network than the karakeep container.
    2. You're using `localhost` as the `OLLAMA_BASE_URL` instead of the actual address of the ollama server. `localhost` points to the container itself, not the docker host. Check this [stackoverflow answer](https://stackoverflow.com/questions/24319662/from-inside-of-a-docker-container-how-do-i-connect-to-the-localhost-of-the-mach) to find how to correctly point to the docker host address instead.

## Crawling not working

Check the logs of the container and this will usually tell you what's wrong. Common problems are:
1. You changed the name of the chrome container but didn't change the `BROWSER_WEB_URL` env variable.

### Browserless compatibility

Connections to Browserless through `BROWSER_WEBSOCKET_URL` use the Playwright protocol. The server must support the same Playwright major/minor version as Karakeep's bundled client.

Karakeep 0.34.0 bundles Patchright 1.59.4 (a Playwright fork), but Browserless v2.57.1 no longer includes a Playwright 1.59 server. As reported in [#3207](https://github.com/karakeep-app/karakeep/issues/3207), this mismatch can leave every crawl stuck after `Successfully navigated to "…". Waiting for the page to load ...` until `CRAWLER_JOB_TIMEOUT_SEC` expires (60 seconds by default), even though the browser connection succeeds. The reporter's working comparison was Browserless v2.57.0, which still includes Playwright 1.59 support.

Prefer [migrating to the Karakeep Chrome image](09-chrome-image-migration.md). Set `BROWSER_WEB_URL=http://chrome:9222` (adjust the hostname for your setup) and remove `BROWSER_WEBSOCKET_URL`. If you continue using Browserless, choose a release that supports your Karakeep client's Playwright major/minor version.

## Upgrading Meilisearch - Migrating the Meilisearch db version

[Meilisearch](https://www.meilisearch.com/) is the database used by karakeep for searching in your bookmarks. Karakeep is tested with the Meilisearch version pinned in the bundled docker compose file, so prefer that version unless you have a reason to change it. After changing the Meilisearch version, you might see errors like `Your database version (x.x.x) is incompatible with your current engine version (x.x.x)`.

See [Upgrading Meilisearch](10-meilisearch-upgrade.md) for how to migrate the database in place, or how to rebuild it from Karakeep instead.

## High memory usage

Karakeep runs as three containers by default, and each one uses memory differently:

- **`web`**: runs two Node.js processes, the web server and the background workers. Worker memory grows the most during large imports and heavy crawling.
- **`chrome`**: the headless browser used for crawling. Its memory goes up with each page it renders.
- **`meilisearch`**: the search engine. It uses the most memory while indexing.

Run `docker stats` to see which container is using the memory, then apply the matching fix below.

### Limit the Node.js heap size

Node.js doesn't run garbage collection until its heap approaches a size limit, and by default that limit depends on how much memory the machine has. On a large machine, the processes in the `web` container can hold on to a lot of memory before they free any of it. Lowering the old generation heap size makes garbage collection run sooner and keeps memory usage down.

Set the `NODE_OPTIONS` environment variable on the `web` container:

```yaml
services:
  web:
    environment:
      NODE_OPTIONS: "--max-old-space-size=1024"
```

Or add it to your `.env` file:

```
NODE_OPTIONS=--max-old-space-size=1024
```

Then run `docker compose up -d` so the change takes effect.

Keep the following in mind:

- The value is in MB. `1024` works well as a starting point. On machines with little RAM you can go down to `512`, but large imports might then run out of memory.
- The limit applies to each process separately. The web server and the workers both get it, so together they can use about twice the value.
- The limit covers only the JavaScript heap. The memory reported for the container (RSS) will be higher than this value.
- If the value is too low, the logs show `JavaScript heap out of memory` and that process crashes. The container restarts it automatically, but the job it was running fails. If you see this error, raise the value.
- This setting doesn't change the HTML and PDF parsing subprocesses. Their limits are set by `CRAWLER_PARSER_MEM_LIMIT_MB` and `ASSET_PREPROCESSING_PDF_PARSER_MEM_LIMIT_MB` (see [the configuration docs](../03-configuration/01-environment-variables.md)).

### Limit Chrome and Meilisearch

Chrome and Meilisearch run in their own containers, so the `NODE_OPTIONS` setting doesn't affect them.

- **Chrome**: give the container a memory limit (see below). If Chrome goes over the limit, Docker kills it and the `restart: unless-stopped` policy starts it again. Crawls that were running at that moment fail and get retried. Each concurrent crawl opens its own page, so keep `CRAWLER_NUM_WORKERS` low (the default is `1`).
- **Meilisearch**: set `MEILI_MAX_INDEXING_MEMORY` (for example, `MEILI_MAX_INDEXING_MEMORY=256Mb`) to limit how much memory it uses while indexing. See the [Meilisearch docs](https://www.meilisearch.com/docs/resources/self_hosting/configuration/reference#max-indexing-memory) for details.

### Set container memory limits

To put a hard limit on each service, add `mem_limit` to your `docker-compose.yml`:

```yaml
services:
  web:
    mem_limit: 2g
    environment:
      NODE_OPTIONS: "--max-old-space-size=1024"
  chrome:
    mem_limit: 1g
  meilisearch:
    mem_limit: 512m
```

These are example values. Adjust them to the size of your machine and your library. Leave headroom in the `web` limit: it has to fit the heap of both Node.js processes, the parsing subprocesses (up to `CRAWLER_PARSER_MEM_LIMIT_MB` / `ASSET_PREPROCESSING_PDF_PARSER_MEM_LIMIT_MB` each), and memory outside the heap. If `mem_limit` is close to or below what `--max-old-space-size` allows, Docker kills the container before Node.js gets the chance to run garbage collection.
