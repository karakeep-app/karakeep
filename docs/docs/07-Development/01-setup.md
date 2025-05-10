# Setup

## Manual Setup

Karakeep uses `node` version 22. To install it, you can use `nvm` [^1]

```
$ nvm install  22
```

Verify node version using this command:
```
$ node --version
v22.14.0
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

Then install the packages and dependencies using:

```
$ pnpm install
```

Output of a successful `pnpm install` run should look something like:

```
Scope: all 20 workspace projects
Lockfile is up to date, resolution step is skipped
Packages: +3129
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 0, reused 2699, downloaded 0, added 3129, done

devDependencies:
+ @karakeep/prettier-config 0.1.0 <- tooling/prettier

. prepare$ husky
└─ Done in 45ms
Done in 5.5s
```

You can now continue with the rest of this documentation.

### First Setup

- You'll need to prepare the environment variables for the dev env. Create a `.env` file in the root of the repository.
- The most important env variables to set are:
  - `DATA_DIR`: Where the database and assets will be stored (e.g., `/path/to/your/karakeep/data`). This is the only strictly required env variable. You can use an absolute path so that all apps point to the same dir.
  - `NEXTAUTH_SECRET`: Random string used to sign the JWT tokens. Generate one with `openssl rand -base64 36`. Logging in will not work if this is missing!
  - `MEILI_ADDR`: The address of your Meilisearch instance (e.g., `http://127.0.0.1:7700`). If not set, search will be disabled.
  - `BROWSER_WEB_URL`: The URL for the headless Chrome instance used by workers (e.g., `http://localhost:9222`). Needed for features like page archiving if running Chrome outside the standard dev docker setup.
  - `OPENAI_API_KEY`: (Optional) Your OpenAI API key if you want to enable auto tag inference in the dev env.
- It's recommended to symlink this root `.env` file into each app directory (`apps/web`, `apps/workers`) and also `packages/db` so they all use the same configuration. You can do this manually or use the setup script described below.
- Run `pnpm run db:migrate` in the root of the repo to set up the database.

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

- Run `pnpm workers` in the root of the repo. This service handles background tasks like fetching link previews, indexing content, and archiving pages. It requires a running Chrome instance (either locally or via Docker) accessible at the `BROWSER_WEB_URL` specified in your `.env`.

### iOS Mobile App

- `cd apps/mobile`
- `pnpm exec expo prebuild --no-install` to build the app.
- Start the ios simulator.
- `pnpm exec expo run:ios`
- The app will be installed and started in the simulator.

Changing the code will hot reload the app. However, installing new packages requires restarting the expo server.

### Browser Extension

- `cd apps/browser-extension`
- You might need to run `pnpm build` once initially to generate the necessary files in the `dist` directory.
- Run `pnpm dev --port 5174`. This starts the development server for the extension, listening on port 5174 for hot-reloading.
- This will generate/update a `dist` directory.
- Go to extension settings in your browser (e.g., `chrome://extensions` or `brave://extensions`).
- Enable "Developer mode".
- Click "Load unpacked" and select the `dist` directory from `apps/browser-extension`.
- The Karakeep extension will appear in your extensions list.

In dev mode, opening and closing the plugin menu should reload the code from the dev server running on port 5174.

## Docker Dev Env

If the manual setup is too much hassle for you. You can use a docker based dev environment by running `docker compose -f docker/docker-compose.dev.yml up` in the root of the repo. This setup wasn't super reliable for me though.

## Optional Setup Script

To simplify the creation of the `.env` file and the necessary symlinks, you can create a `setup_dev.sh` script in the root of the repository with the following content:

```bash
#!/bin/bash

# Define the root directory and data directory
ROOT_DIR=$(pwd)
DATA_DIR="$ROOT_DIR/dev-data" # Or choose another path

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Generate NEXTAUTH_SECRET
NEXTAUTH_SECRET=$(openssl rand -base64 36)

# Create the .env file
cat << EOF > .env
# Karakeep Development Environment Variables
DATA_DIR=$DATA_DIR
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
MEILI_ADDR=http://127.0.0.1:7700
BROWSER_WEB_URL=http://localhost:9222
# OPENAI_API_KEY=your_key_here # Uncomment and add your key if needed
EOF

echo ".env file created in root."

# Create symlinks
ln -sf "$ROOT_DIR/.env" "$ROOT_DIR/apps/web/.env"
ln -sf "$ROOT_DIR/.env" "$ROOT_DIR/apps/workers/.env"
ln -sf "$ROOT_DIR/.env" "$ROOT_DIR/packages/db/.env"

echo "Symlinks created for apps/web, apps/workers, and packages/db."

echo "Setup complete. Remember to run 'pnpm install' and 'pnpm run db:migrate'."
```

Make the script executable (`chmod +x setup_dev.sh`) and run it (`./setup_dev.sh`). This will create the `.env` file with generated secrets and default values, and set up the symlinks for you. Remember to still run `pnpm install` and `pnpm run db:migrate` afterwards.

## Node Version Manager

[^1]: [nvm](https://github.com/nvm-sh/nvm) is a node version manager. You can install it following [these
instructions](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating).

[^2]: [corepack](https://nodejs.org/api/corepack.html) is an experimental tool to help with managing versions of your
package managers.
