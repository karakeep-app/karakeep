# Pinned to an exact release so security fixes land deliberately instead of
# depending on whether a floating tag was re-pulled. Bump on every Node.js
# security release: https://nodejs.org/en/blog/vulnerability
ARG NODE_VERSION=24.22.3

################# Monolith Builder ##############
FROM rust:1-bookworm AS monolith_builder

# Pinned so that a new (or hijacked) crates.io release doesn't silently end up
# in the image. Bump deliberately: https://crates.io/crates/monolith
ARG MONOLITH_VERSION=2.11.7

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        libssl-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install monolith --version "${MONOLITH_VERSION}" --locked

################# Base Builder ##############
FROM node:${NODE_VERSION}-slim AS base

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Keep Corepack current enough to verify modern pnpm release signatures.
# Pinned so the build doesn't pick up whatever corepack was published last.
RUN npm install -g corepack@0.36.0 && corepack enable pnpm

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        make \
        g++ \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cli/package.json ./apps/cli/
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/web/package.json ./apps/web/
COPY apps/workers/package.json ./apps/workers/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/open-api/package.json ./packages/open-api/
COPY packages/plugins/package.json ./packages/plugins/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/shared-react/package.json ./packages/shared-react/
COPY packages/shared-server/package.json ./packages/shared-server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/trpc/package.json ./packages/trpc/
COPY tooling/github/package.json ./tooling/github/
COPY tooling/oxlint/package.json ./tooling/oxlint/
COPY tooling/tailwind/package.json ./tooling/tailwind/
COPY tooling/typescript/package.json ./tooling/typescript/
COPY ./patches ./patches

ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

# `pnpm exec`/`pnpm run` first check node_modules against the workspace and
# install if they differ, which fails mid-way here (EXDEV across image layers).
# Fail instead: every workspace package that COPY . . brings in must have its
# package.json copied above, or be listed in .dockerignore.
ENV pnpm_config_verify_deps_before_run=error

COPY . .

# Each app is built in its own stage so that images only build the apps they
# ship (e.g. the cli image doesn't compile the web app) and BuildKit can build
# them in parallel.

################# DB Migrations Builder ##############
FROM base AS db_migrations_builder

# Bundle migrate.ts and its dependencies into one file, since /db_migrations
# has no node_modules. rolldown transforms TypeScript without the TypeScript
# API, which ncc's ts-loader needed. better-sqlite3 picks its prebuilt binary
# by a computed path that can't be bundled, so it's copied in unbundled; its
# only dependency, node-addon-api, is just for building the binary from source.
RUN cd packages/db && \
    pnpm exec rolldown migrate.ts --platform node --format cjs \
      --external better-sqlite3 --file /db_migrations/index.js && \
    cp -R drizzle /db_migrations && \
    sqlite_dir=$(node -p "require('path').dirname(require.resolve('better-sqlite3/package.json'))") && \
    mkdir -p /db_migrations/node_modules/better-sqlite3 && \
    cp -R "$sqlite_dir/package.json" "$sqlite_dir/lib" "$sqlite_dir/prebuilds" \
      /db_migrations/node_modules/better-sqlite3/

################# Web Builder ##############
FROM base AS web_builder

RUN (cd apps/web && pnpm exec next build --experimental-build-mode compile)

################# Workers Builder ##############
FROM base AS workers_builder

RUN (cd apps/workers && pnpm build)
RUN CI=true pnpm deploy --node-linker=isolated --legacy --filter @karakeep/workers --prod /prod/workers

################# CLI Builder ##############
FROM base AS cli_builder

RUN (cd apps/cli && pnpm build)

################# MCP Builder ##############
FROM base AS mcp_builder

RUN (cd apps/mcp && pnpm build)

################# The All-in-one builder ##############
FROM node:${NODE_VERSION}-slim AS aio_builder
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

ARG SERVER_VERSION=nightly
ENV SERVER_VERSION=${SERVER_VERSION}

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
EXPOSE 3000

######################
# Prepare s6-overlay
######################
# The tarballs are verified against checksums pinned here, so a re-uploaded
# release asset can't change what ends up in the image. When bumping the
# version, take the checksums from the `.sha256` file published next to each
# asset and verify them against the downloaded files.
ARG S6_OVERLAY_VERSION=3.2.1.0
ARG S6_OVERLAY_NOARCH_SHA256=42e038a9a00fc0fef70bf0bc42f625a9c14f8ecdfe77d4ad93281edf717e10c5
ARG S6_OVERLAY_X86_64_SHA256=8bcbc2cada58426f976b159dcc4e06cbb1454d5f39252b3bb0c778ccf71c9435
ARG S6_OVERLAY_AARCH64_SHA256=c8fd6b1f0380d399422fc986a1e6799f6a287e2cfa24813ad0b6a4fb4fa755cc
ARG TARGETARCH

# Install wget and xz-utils needed for s6-overlay
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        ca-certificates \
        wget \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN case ${TARGETARCH} in \
            "amd64")  S6_ARCH=x86_64;  S6_ARCH_SHA256=${S6_OVERLAY_X86_64_SHA256}  ;; \
            "arm64")  S6_ARCH=aarch64; S6_ARCH_SHA256=${S6_OVERLAY_AARCH64_SHA256} ;; \
            *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
        esac \
    && S6_URL=https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION} \
    && wget -q "${S6_URL}/s6-overlay-noarch.tar.xz" -O /tmp/s6-overlay-noarch.tar.xz \
    && echo "${S6_OVERLAY_NOARCH_SHA256}  /tmp/s6-overlay-noarch.tar.xz" | sha256sum -c - \
    && wget -q "${S6_URL}/s6-overlay-${S6_ARCH}.tar.xz" -O /tmp/s6-overlay-${S6_ARCH}.tar.xz \
    && echo "${S6_ARCH_SHA256}  /tmp/s6-overlay-${S6_ARCH}.tar.xz" | sha256sum -c - \
    && tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz \
    && tar -C / -Jxpf /tmp/s6-overlay-${S6_ARCH}.tar.xz \
    && rm -f /tmp/s6-overlay-noarch.tar.xz /tmp/s6-overlay-${S6_ARCH}.tar.xz

# Copy the s6-overlay config
COPY --chmod=755 ./docker/root/etc/s6-overlay /etc/s6-overlay

######################
# Install runtime deps
######################
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        curl \
        graphicsmagick \
        ghostscript \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Pinned and checksum-verified rather than taken from `releases/latest`, so the
# image doesn't run whatever was uploaded last. yt-dlp has to keep up with site
# changes, so bump this before cutting a release. The checksums come from the
# release's SHA2-256SUMS file; verify them against the downloaded binaries.
ARG YTDLP_VERSION=2026.10.26
ARG YTDLP_LINUX_SHA256=767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795
ARG YTDLP_LINUX_AARCH64_SHA256=e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483
ARG TARGETARCH
RUN case ${TARGETARCH} in \
        "amd64")  YTDLP_FILE=yt-dlp_linux;         YTDLP_SHA256=${YTDLP_LINUX_SHA256} ;; \
        "arm64")  YTDLP_FILE=yt-dlp_linux_aarch64; YTDLP_SHA256=${YTDLP_LINUX_AARCH64_SHA256} ;; \
        *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${YTDLP_FILE} -o /usr/local/bin/yt-dlp \
    && echo "${YTDLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum -c - \
    && chmod +x /usr/local/bin/yt-dlp

# yt-dlp >=2025.x requires a JavaScript runtime to extract YouTube formats.
# Deno is yt-dlp's default but is not present in this image. Node is the
# base image and is fully supported by yt-dlp (min v20). Point yt-dlp at it
# via its system config file so every invocation picks it up without
# changes to the worker. Fixes karakeep-app/karakeep#2758.
RUN echo "--js-runtimes node" > /etc/yt-dlp.conf

# Copy monolith binary from builder
COPY --from=monolith_builder /usr/local/cargo/bin/monolith /usr/local/bin/monolith

######################
# Prepare the web app
######################

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXTAUTH_URL_INTERNAL=http://localhost:${PORT}

COPY --from=web_builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web_builder /app/apps/web/public ./apps/web/public
COPY --from=db_migrations_builder /db_migrations /db_migrations

# Set the correct permission for prerender cache
RUN mkdir -p ./apps/web/.next && chown node:node ./apps/web/.next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=web_builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

######################
# Prepare the workers app
######################
COPY --from=workers_builder /prod/workers /app/apps/workers

# s6-overlay requires /run to be owned by the container user. Its init fixes
# this at runtime via the setuid suexec helper, which Kubernetes runAsNonRoot
# (no_new_privs), rootless docker and no-new-privileges setups deny — so bake
# it for the node user.
RUN chown node:node /run

ENTRYPOINT ["/init"]

################# The AIO ##############

FROM aio_builder AS aio

RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-db-migration \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-web \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-workers

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

################# The web container ##############

FROM aio_builder AS web

RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-db-migration \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-web
ENV USING_LEGACY_SEPARATE_CONTAINERS=true

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

################# The workers container ##############

FROM aio_builder AS workers

# In the current implemtation, the workers assume the migration
# is done for them.
RUN rm /etc/s6-overlay/s6-rc.d/svc-workers/dependencies.d/init-db-migration \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-workers
ENV USING_LEGACY_SEPARATE_CONTAINERS=true

################# The cli ##############
FROM node:${NODE_VERSION}-slim AS cli
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

COPY --from=cli_builder /app/apps/cli/dist/index.mjs apps/cli/index.mjs

WORKDIR /app/apps/cli

ARG SERVER_VERSION=nightly
ENV SERVER_VERSION=${SERVER_VERSION}

ENTRYPOINT ["node", "index.mjs"]

################# MCP server ##############
FROM node:${NODE_VERSION}-slim AS mcp
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

COPY --from=mcp_builder /app/apps/mcp/dist/index.js apps/mcp/index.js

WORKDIR /app/apps/mcp

ENTRYPOINT ["node", "index.js"]
