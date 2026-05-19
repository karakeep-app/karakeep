# Setup

## Quick Start

For the fastest way to get started with development, use the one-command setup script:

```bash
./start-dev.sh
```

This script will automatically:
- Start Meilisearch in Docker (on port 7700)
- Start headless Chrome in Docker (on port 9222)
- Install dependencies with `pnpm install` if needed
- Start both the web app and workers in parallel
- Provide cleanup when you stop with Ctrl+C

**Prerequisites:**
- Docker installed and running
- pnpm installed (see manual setup below for installation instructions)

The script will output the running services:
- Web app: http://localhost:3000
- Meilisearch: http://localhost:7700  
- Chrome debugger: http://localhost:9222

Press Ctrl+C to stop all services and clean up Docker containers.

Alternatively, you can use Docker Compose to run the full stack in containers — see [Docker Compose Details](#docker-compose-details) below.

## Manual Setup

Karakeep uses `node` version 24. To install it, you can use `nvm` [^1]

```
$ nvm install 24
```

Verify node version using this command:
```
$ node --version
v24.0.0
```

Karakeep also makes use of `corepack`[^2]. If you have `node` installed, then `corepack` should already be
installed on your machine, and you don't need to do anything. To verify the `corepack` is installed run:

```
$ command -v corepack
/home/<user>/.nvm/versions/node/v22.14.0/bin/corepack
```

To enable `corepack` run the following command:

```
$ corepack enable
```

Then, from the root of the repository, install the packages and dependencies using:

```
$ pnpm install
```

Output of a successful `pnpm install` run should look something like:

```
Scope: all 20 workspace projects
Lockfile is up to date, resolution step is skipped
Packages: +3129
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 0, reused 2699, downloaded 0, added 3129, done

devDependencies:
+ @karakeep/prettier-config 0.1.0 <- tooling/prettier

. prepare$ husky
└─ Done in 45ms
Done in 5.5s
```

You can now continue with the rest of this documentation.

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

Meilisearch is the provider for the full text search (and at some point embeddings search too). You can get it running with `docker run -p 7700:7700 getmeili/meilisearch:v1.41.0`.

Mount persistent volume if you want to keep index data across restarts. You can trigger a re-index for the entire items collection in the admin panel in the web app.

#### Chrome

The worker app will automatically start headless chrome on startup for crawling pages. You don't need to do anything there.

### Web App

- Run `pnpm web` in the root of the repo.
- Go to `http://localhost:3000`.

> NOTE: The web app kinda works without any dependencies. However, search won't work unless meilisearch is running. Also, new items added won't get crawled/indexed unless workers are running.

### Workers

- Run `pnpm workers` in the root of the repo.

### Mobile App (iOS & Android)

#### Prerequisites

To build and run the mobile app locally, you'll need:

- **For iOS development**: 
  - macOS
  - Xcode installed from the App Store
  - iOS Simulator (comes with Xcode)

- **For Android development**:
  - Android Studio installed
  - Android SDK configured
  - Android Emulator or physical device

For detailed setup instructions, refer to the [Expo documentation](https://docs.expo.dev/guides/local-app-development/).

#### Updating from an Older Version

If you are returning to mobile development after a significant update to the source (e.g. Expo version bump or major dependency changes), the build may fail with stale artifacts in workspace `node_modules`. Run a clean wipe before reinstalling:

```bash
pnpm run clean:workspaces
pnpm install
pnpm --filter @karakeep/mobile clean:prebuild
```

Then continue with the prebuild and run steps below.

#### Quick Start

```sh
# ios
pnpm ios

# android
pnpm android
```

More details below if you want to understand what's going on.


#### Details

The app has three variants: development, preview, and release.

| Variant | Description | Expo Dev Tools | Command (iOS) | Command (Android) |
|---------|-------------|----------------|---------------|--------------------|
| Development (default) | Requires the expo devserver to be running. Uses a separate bundle ID so it can be installed alongside the production app. | Yes | `pnpm ios` | `pnpm android` |
| Preview | Standalone app that doesn't require the expo devserver. Uses its own bundle ID. | No | `pnpm --filter @karakeep/mobile ios:preview` | `pnpm --filter @karakeep/mobile android:preview` |
| Release | Standalone app using the production bundle ID. Closest to a production build. | No | `pnpm --filter @karakeep/mobile ios:release` | `pnpm --filter @karakeep/mobile android:release` |

In 90% of the cases, you'll want to use the development variant.

Note: Changing the code will hot reload the app. However, installing new packages requires restarting the expo server.


### Browser Extension

- `cd apps/browser-extension`
- `pnpm dev`
- This will generate a `dist` package
- Go to extension settings in chrome and enable developer mode.
- Press `Load unpacked` and point it to the `dist` directory.
- The plugin will pop up in the plugin list.

In dev mode, opening and closing the plugin menu should reload the code.


## Docker Compose Details

If you prefer to run the full stack inside Docker, follow these steps:

1. (Optional) Copy the sample env file whenever you need to override the defaults or commit real secrets:

```bash
cp .env.sample .env
```

   - Even if you skip this step, the compose file injects sensible defaults: `DATA_DIR=/data`, `MEILI_ADDR=http://meilisearch:7700`, `NEXTAUTH_URL=http://localhost:3000`, and `NEXTAUTH_SECRET=super-secure-nextauth-secret`.
   - When you're ready, set at least `NEXTAUTH_SECRET` (use `openssl rand -base64 36`) and any optional keys like `OPENAI_API_KEY` inside `.env` so they override the defaults.
   - The stack automatically mounts `/data` inside the containers, so you only need to change `DATA_DIR` if you prefer a host path.
2. Start every dependency, install packages, and run migrations in one go:

```bash
docker compose -f docker/docker-compose.dev.yml up
```

   - The `prep` service creates `DATA_DIR` (if missing), runs `pnpm install --frozen-lockfile`, and then `pnpm run db:migrate` the first time (and whenever you restart the stack) so the rest of the services always have dependencies ready.
   - The `web` and `workers` services run `pnpm web` and `pnpm workers` respectively using the same code that lives on your host machine, so hot reload works out of the box.
3. Tail the dev logs when needed:

```bash
docker compose logs -f web workers
```

4. Stop everything with `docker compose down`. Re-run with `--build` if you change Node dependencies or the Dockerfile.

This setup exposes:
- Web app: http://localhost:3000
- Chrome debugger: http://localhost:9222

Meilisearch runs as an internal service only (no host port exposed).

`docker compose -f docker/docker-compose.dev.yml up` starts five services:

- `prep`: installs dependencies and runs database migrations before anything else boots.
- `web`: runs `pnpm web` with hot reload enabled (polling watchers are turned on for reliable Mac/Windows file sync).
- `workers`: runs `pnpm workers` so crawlers, importers, and background jobs behave the same way as in local dev.
- `meilisearch`: exposes http://localhost:7700 with analytics disabled and persistent data stored in the `meilisearch` Docker volume.
- `chrome`: provides the remote-debuggable Chrome instance required by the workers on http://localhost:9222.

All application containers mount your checkout into `/app` and share two volumes: `node_modules` (so dependencies live inside Linux containers) and `pnpm-store` (to keep the pnpm cache). If you ever need a clean slate you can remove them with:

```bash
docker compose -f docker/docker-compose.dev.yml down -v
```

Every environment value is defined with `${VAR:-default}` syntax, so the stack boots even if `.env` is missing; create the file only when you want to override something like `NEXTAUTH_SECRET` or `MEILI_MASTER_KEY`.

You can override the default `/data` mount by editing `DATA_DIR` in `.env` and binding a host directory via a regular Docker volume mapping. Any other environment variable defined in `.env` is automatically propagated to the Node services.

[^1]: [nvm](https://github.com/nvm-sh/nvm) is a node version manager. You can install it following [these
instructions](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating).

[^2]: [corepack](https://nodejs.org/api/corepack.html) is an experimental tool to help with managing versions of your
package managers.
