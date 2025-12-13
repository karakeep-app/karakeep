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

## Manual Setup

Karakeep uses `node` version 24. To install it, you can use `nvm` [^1]

```
$ nvm install  24
```

Verify node version using this command:
```
$ node --version
v24.14.0
```

Karakeep also makes use of `corepack`[^2]. If you have `node` installed, then `corepack` should already be
installed on your machine, and you don't need to do anything. To verify the `corepack` is installed run:

```
$ command -v corepack
/home/<user>/.nvm/versions/node/v24.14.0/bin/corepack
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

Meilisearch is the provider for the full text search (and at some point embeddings search too). You can get it running with `docker run -p 7700:7700 getmeili/meilisearch:v1.13.3`.

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
  - macOS computer
  - Xcode installed from the App Store
  - iOS Simulator (comes with Xcode)

- **For Android development**:
  - Android Studio installed
  - Android SDK configured
  - Android Emulator or physical device

For detailed setup instructions, refer to the [Expo documentation](https://docs.expo.dev/guides/local-app-development/).

#### Running the app

- `cd apps/mobile`
- `pnpm exec expo prebuild --no-install` to build the app.

**For iOS:**
- `pnpm exec expo run:ios`
- The app will be installed and started in the simulator.

**Troubleshooting iOS Setup:**
If you encounter an error like `xcrun: error: SDK "iphoneos" cannot be located`, you may need to set the correct Xcode developer directory:
```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

**For Android:**
- Start the Android emulator or connect a physical device.
- `pnpm exec expo run:android`
- The app will be installed and started on the emulator/device.

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


[^1]: [nvm](https://github.com/nvm-sh/nvm) is a node version manager. You can install it following [these
instructions](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating).

[^2]: [corepack](https://nodejs.org/api/corepack.html) is an experimental tool to help with managing versions of your
package managers.
