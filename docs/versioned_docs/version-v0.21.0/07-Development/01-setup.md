# Setup

## Manual Setup
### First Setup

- You'll need to prepare the environment variables for the dev env.
- Easiest would be to set it up once in the root of the repo and then symlink it in each app directory (e.g. `/apps/web`, `/apps/workers`) and also `/packages/db`.
- Start by copying the template by `cp .env.sample .env`.
- The most important env variables to set are:
  - `DATA_DIR`: Where the database and assets will be stored. This is the only required env variable. You can use an absolute path so that all apps point to the same dir.
  - `NEXTAUTH_SECRET`: Random string used to sign the JWT tokens. Generate one with `openssl rand -base64 36`. Logging in will not work if this is missing!
  - `MEILI_ADDR`: If not set, search will be disabled. You can set it to `http://127.0.0.1:7700` if you run meilisearch using the command below.
  - `OPENAI_API_KEY`: If you want to enable auto tag inference in the dev env.
- run `pnpm run db:migrate` in the root of the repo to set up the database.

### Dependencies

#### Meilisearch

Meilisearch is the provider for the full text search. You can get it running with `docker run -p 7700:7700 getmeili/meilisearch:v1.11.1`.

Mount persistent volume if you want to keep index data across restarts. You can trigger a re-index for the entire items collection in the admin panel in the web app.

#### Chrome

The worker app will automatically start headless chrome on startup for crawling pages. You don't need to do anything there.

### Web App

- Run `pnpm web` in the root of the repo.
- Go to `http://localhost:3000`.

> NOTE: The web app kinda works without any dependencies. However, search won't work unless meilisearch is running. Also, new items added won't get crawled/indexed unless workers are running.

### Workers

- Run `pnpm workers` in the root of the repo.

### iOS Mobile App

- `cd apps/mobile`
- `pnpm exec expo prebuild --no-install` to build the app.
- Start the ios simulator.
- `pnpm exec expo run:ios`
- The app will be installed and started in the simulator.

Changing the code will hot reload the app. However, installing new packages requires restarting the expo server.

### Browser Extension

- `cd apps/browser-extension`
- `pnpm dev`
- This will generate a `dist` package
- Go to extension settings in chrome and enable developer mode.
- Press `Load unpacked` and point it to the `dist` directory.
- The plugin will pop up in the plugin list.

In dev mode, opening and closing the plugin menu should reload the code.


## Docker Dev Env

If the manual setup is too much hassle for you. You can use a docker based dev environment by running `docker compose -f docker/docker-compose.dev.yml up` in the root of the repo. This setup wasn't super reliable for me though.
