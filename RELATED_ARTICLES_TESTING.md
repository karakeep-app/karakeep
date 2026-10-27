# Testing the related-articles feature locally

This guide sets up a local environment for manual testing of the
similar-articles feature (LLM embeddings + Meilisearch + the reader/preview UI).

It covers four containers (Meilisearch, Ollama, Chrome, test websites), the
`.env` configuration, starting the dev server, and checking the pipeline.

---

## 1. Prerequisites

- Docker (or Podman with a `docker` alias)
- Node.js ≥ 22 and `pnpm`
- Enough RAM/CPU for a small local LLM: `gemma4:e4b` (8B) is used for
  summaries and runs on CPU, about 45–90 s per article.

## 2. Start the containers

Run these from the repository root.

### Meilisearch (vector store + full-text search)

```sh
docker run -d --name karakeep-meilisearch \
  -p 127.0.0.1:7700:7700 \
  -v karakeep-meili:/meili_data \
  -e MEILI_NO_ANALYTICS=true \
  getmeili/meilisearch:v1.41.0
```

### Ollama (embeddings + summaries)

```sh
docker run -d --name karakeep-ollama \
  -p 127.0.0.1:11434:11434 \
  -v karakeep-ollama:/root/.ollama \
  ollama/ollama
```

Pull the two models this branch currently uses:

```sh
docker exec karakeep-ollama ollama pull embeddinggemma-2   # embeddings (768 dims via /api/embed)
docker exec karakeep-ollama ollama pull gemma4:e4b         # summaries / text inference (8B)
```

Confirm the embedding dimensionality (must match `EMBEDDING_DIMENSIONS` in `.env`):

```sh
curl -s http://127.0.0.1:11434/api/embed \
  -d '{"model":"embeddinggemma-2:latest","input":"hello"}' \
  | jq '.embeddings[0] | length'
# → 768
```

> Note: Ollama's model metadata reports 512 for this model, but the `/api/embed`
> endpoint returns 768. Karakeep validates against the API output, so use 768.

### Chrome (headless, used by the crawler)

```sh
docker run -d --name karakeep-chrome \
  --init \
  --network host \
  ghcr.io/karakeep-app/karakeep-chrome:release \
  --disable-gpu \
  --disable-dev-shm-usage \
  --hide-scrollbars \
  --disable-blink-features=AutomationControlled \
  --window-size=1440,900
```

`--network host` matters: the browser must resolve `localhost` to your host so
it can reach the test websites below. On Docker Desktop (macOS/Windows) host
networking behaves differently — use `-p 127.0.0.1:9222:9222` instead and crawl
`http://host.docker.internal:8099/...`.

### Test websites (nginx on port 8099)

```sh
docker run -d --name karakeep-test-sites \
  -p 8099:80 \
  -v "$PWD/packages/e2e_tests/setup/html:/usr/share/nginx/html:ro" \
  -v "$PWD/packages/e2e_tests/setup/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine
```

Check that everything is reachable:

```sh
curl -s http://127.0.0.1:9222/json/version | jq .Browser   # Chrome CDP
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8099/hello.html   # 200
curl -s http://127.0.0.1:7700/health                       # {"status":"available"}
```

## 3. Create `.env` at the repository root

```dotenv
# --- Paths / auth ---
DATA_DIR=<absolute path to this repo>/data
NEXTAUTH_SECRET=<random hex, e.g. openssl rand -hex 32>

# --- Vector store ---
MEILI_ADDR=http://127.0.0.1:7700

# --- Embeddings via Ollama ---
OLLAMA_BASE_URL=http://127.0.0.1:11434
EMBEDDING_TEXT_MODEL=embeddinggemma-2:latest
EMBEDDING_DIMENSIONS=768
EMBEDDING_ENABLE_AUTO_INDEXING=true

# --- Summaries / text inference via Ollama ---
INFERENCE_ENABLE_AUTO_SUMMARIZATION=true
INFERENCE_TEXT_MODEL=gemma4:e4b
INFERENCE_IMAGE_MODEL=gemma4:e4b
INFERENCE_ENABLE_AUTO_TAGGING=false
INFERENCE_JOB_TIMEOUT_SEC=600
INFERENCE_FETCH_TIMEOUT_SEC=600

# --- Crawler ---
BROWSER_WEB_URL=http://127.0.0.1:9222
# Allow the crawler to fetch the local test pages. Remove for real sites only.
CRAWLER_ALLOWED_INTERNAL_HOSTNAMES=.
```

Important:

- `EMBEDDING_DIMENSIONS` must equal the embedding model's actual output length
  (768 here). A mismatch makes every vector write fail with
  `invalid_vector_dimensions`.
- With `OLLAMA_BASE_URL` set, auto-indexing defaults to **off**;
  `EMBEDDING_ENABLE_AUTO_INDEXING=true` is required or nothing is embedded.
- Any ad-hoc script/process that loads the vector-store plugin must use the
  same `EMBEDDING_DIMENSIONS` (or load `.env`). Otherwise the plugin
  reconfigures the Meilisearch index to the default 1536 dimensions and
  **discards the stored vectors**.
- `INFERENCE_ENABLE_AUTO_TAGGING=false` keeps CPU usage down. Set it to `true`
  (or remove the line) if you also want to test auto-tagging.

## 4. Start the dev server

```sh
pnpm dev:worktree
```

This installs dependencies if needed, seeds `data/` (on first run), migrates the
database and the queue database, picks a free port between 3100 and 3199, and
starts the web app plus the workers. Logs:

```
$TMPDIR/karakeep-dev-<worktree>/web.log
$TMPDIR/karakeep-dev-<worktree>/workers.log
```

Seed users (password `test1234`):

| Email | Role |
| --- | --- |
| `test1@example.com` | admin, 20 bookmarks |
| `test2@example.com` | user, 4 bookmarks |
| `test3@example.com` | user, no data |

> If the repository already contains a populated `data/` directory, use the
> users from that dataset instead (this checkout uses `manual@example.com`).
> To recreate the canonical seed: `(cd tools/seed-snapshot && node --import tsx src/apply.ts --force)`.

The web app hot-reloads; **worker changes require restarting** `pnpm dev:worktree`.

## 5. Exercise the feature

1. Add a few bookmarks — either real articles or the local test pages:
   - `http://localhost:8099/hello.html`
   - `http://localhost:8099/browser-rendered.html`
   - `http://localhost:8099/hello.html?article=2` (near-duplicate URL)
2. Watch `workers.log` for the pipeline:
   ```
   [embeddings][..] Generated 2 embeddings for bookmark … (… chars, … chars) … 768 dimensions
   [embeddings][..] Indexed embedding … (and a 768-dimensional similar-articles vector)
   [inference][..] Generated summary for bookmark …
   ```
   A summary triggers an automatic embedding refresh, so each bookmark is
   embedded twice: first from `Title + Content`, then from `Title + Summary`.
3. Open a bookmark:
   - **Preview**: the right-hand details column shows the "Similar Articles"
     list (4 rows) with **Show all / Show less**.
   - **Full reader** (open the article full screen): a full-width grid of
     related articles, folded to about two rows with **Show all / Show less**.
4. Check the vector store:

   ```sh
   # Every bookmark should have two vectors (search profile + similar)
   curl -s http://127.0.0.1:7700/indexes/bookmarks_vectors/stats
   # → numberOfEmbeddings = 2 × numberOfDocuments

   curl -s http://127.0.0.1:7700/indexes/bookmarks_vectors/settings/embedders
   # → default + similar, both userProvided, dimensions 768
   ```

## 6. Rebuilding embeddings

Run this after changing the embedding model, changing `EMBEDDING_DIMENSIONS`,
or upgrading from a version that stored vectors in the old format. It also
re-adds the `similar` embedder if the index predates the two-vector layout.

Create an admin API key in the web UI (Settings → API Keys) and run:

```sh
cd apps/cli
KARAKEEP_API_KEY=<key> KARAKEEP_SERVER_ADDR=http://localhost:3100 \
  node --import tsx src/index.ts admin jobs regenerate-embeddings --status all
```

Useful variants: `--status failure` (only failed bookmarks), `--status pending`,
and `--modified-within 24h`.

## 7. Models in use

| Purpose | Model | Notes |
| --- | --- | --- |
| Embeddings (both vectors) | `embeddinggemma-2:latest` via Ollama | 768 dimensions; one `/api/embed` call produces the lean similar-articles vector and the rich search-profile vector |
| Summaries and other text inference | `gemma4:e4b` via Ollama | 8B, CPU: ~45–90 s per article; very long or consent-walled pages can yield empty responses (retried) or short summaries |
| Vector store | Meilisearch `v1.41.0` | Index `bookmarks_vectors` with two userProvided embedders: `default` (search profile) and `similar` (similar articles) |

## 8. Known limitations while testing

- **Consent walls**: sites like `golem.de` serve a consent dialog that
  DuckDuckGo's autoconsent ruleset doesn't cover (and which offers no reject
  button). The crawler may store the consent page instead of the article.
  Prefer sites that serve content (e.g. heise, spiegel) or the local test pages.
- Related articles only appear once a bookmark's embedding is `success`. New
  bookmarks are `pending` until the crawler has finished and the embedding job
  ran; while pending, the reader page intentionally shows no related section.
- Changing `EMBEDDING_TEXT_MODEL`/`EMBEDDING_DIMENSIONS` invalidates existing
  vectors; regenerate them (section 6) and restart the workers so the plugin
  picks up the new embedder configuration.
