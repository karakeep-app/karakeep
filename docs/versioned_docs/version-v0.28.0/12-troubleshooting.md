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

## Upgrading Meilisearch - Migrating the Meilisearch db version

[Meilisearch](https://www.meilisearch.com/) is the database used by karakeep for searching in your bookmarks. The version used by karakeep is `1.13.3` and it is advised not to upgrade it without good reasons. If you do, you might see errors like `Your database version (1.11.1) is incompatible with your current engine version (1.13.3). To migrate data between Meilisearch versions, please follow our guide on https://www.meilisearch.com/docs/learn/update_and_migration/updating.`.

Luckily we can easily workaround this:
1. Stop the Meilisearch container.
2. Inside the Meilisearch volume bound to `/meili_data`, erase/rename the folder called `data.ms`.
3. Launch Meilisearch again.
4. Login to karakeep as administrator and go to (as of v0.24.1) `Admin Settings > Background Jobs` then click on `Reindex All Bookmarks`.
5. When the reindexing has finished, Meilisearch should be working as usual.

If you run into issues, the official documentation can be found [there](https://www.meilisearch.com/docs/learn/update_and_migration/updating).
