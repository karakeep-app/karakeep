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
3. You didn't change the `INFERENCE_TEXT_MODEL` env variable, resulting into hoarder attempting to use gpt models with ollama which won't work.
4. Ollama server is not reachable by the hoarder container. This can be caused by:
    1. Ollama server being in a different docker network than the hoarder container.
    2. You're using `localhost` as the `OLLAMA_BASE_URL` instead of the actual address of the ollama server. `localhost` points to the container itself, not the docker host. Check this [stackoverflow answer](https://stackoverflow.com/questions/24319662/from-inside-of-a-docker-container-how-do-i-connect-to-the-localhost-of-the-mach) to find how to correctly point to the docker host address instead.

## Crawling not working

Check the logs of the container and this will usually tell you what's wrong. Common problems are:
1. You changed the name of the chrome container but didn't change the `BROWSER_WEB_URL` env variable.
