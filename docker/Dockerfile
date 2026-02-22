################# Monolith Builder ##############
FROM rust:1-bookworm AS monolith_builder

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        libssl-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install monolith

################# Base Builder ##############
FROM node:24-slim AS base

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# https://github.com/karakeep-app/karakeep/issues/967
RUN npm install -g corepack@0.31.0 && corepack enable

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        make \
        g++ \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
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
COPY tooling/prettier/package.json ./tooling/prettier/
COPY tooling/tailwind/package.json ./tooling/tailwind/
COPY tooling/typescript/package.json ./tooling/typescript/
COPY ./patches ./patches

ENV NEXT_TELEMETRY_DISABLED 1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

COPY . .

# Build the db migration script
RUN cd packages/db && \
    pnpm exec ncc build migrate.ts -o /db_migrations && \
    cp -R drizzle /db_migrations


# Compile the web app
RUN (cd apps/web && pnpm exec next build --experimental-build-mode compile)

# Build the worker code
RUN (cd apps/workers && pnpm build)
RUN pnpm deploy --node-linker=isolated --filter @karakeep/workers --prod /prod/workers

# Build the cli
RUN (cd apps/cli && pnpm build)

# Build the mcp server
RUN (cd apps/mcp && pnpm build)

################# The All-in-one builder ##############

FROM node:24-slim AS aio_builder
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

ARG SERVER_VERSION=nightly
ENV SERVER_VERSION=${SERVER_VERSION}

ENV PORT 3000
ENV WEB_HOST "0.0.0.0"
EXPOSE 3000

######################
# Prepare s6-overlay
######################
ARG S6_OVERLAY_VERSION=3.2.1.0
ARG TARGETARCH

# Install wget and xz-utils needed for s6-overlay
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        ca-certificates \
        wget \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz \
    && case ${TARGETARCH} in \
            "amd64")  S6_ARCH=x86_64   ;; \
            "arm64")  S6_ARCH=aarch64  ;; \
        esac \
    && echo https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz -O /tmp/s6-overlay-${S6_ARCH}.tar.xz \
    && wget https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz -O /tmp/s6-overlay-${S6_ARCH}.tar.xz \
    && tar -C / -Jxpf /tmp/s6-overlay-${S6_ARCH}.tar.xz \
    && rm -f /tmp/s6-overlay-${S6_ARCH}.tar.xz

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
        libjemalloc2 \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
RUN case ${TARGETARCH} in \
        "amd64")  YTDLP_FILE=yt-dlp_linux ;; \
        "arm64")  YTDLP_FILE=yt-dlp_linux_aarch64 ;; \
        *) echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_FILE} -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# Copy monolith binary from builder
COPY --from=monolith_builder /usr/local/cargo/bin/monolith /usr/local/bin/monolith

######################
# Prepare the web app
######################

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV NEXTAUTH_URL_INTERNAL=http://localhost:${PORT}

# Create symlink for jemalloc based on architecture
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        ln -s /usr/lib/aarch64-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so; \
    else \
        ln -s /usr/lib/x86_64-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so; \
    fi

COPY --from=base --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=base /app/apps/web/public ./apps/web/public
COPY --from=base /db_migrations /db_migrations

# Set the correct permission for prerender cache
RUN mkdir -p ./apps/web/.next && chown node:node ./apps/web/.next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=base --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

######################
# Prepare the workers app
######################
COPY --from=base /prod/workers /app/apps/workers

ENTRYPOINT ["/init"]

################# The AIO ##############

FROM aio_builder AS aio

RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-db-migration \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-web \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-workers

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

################# The web container ##############

FROM aio_builder AS web

RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-db-migration \
    /etc/s6-overlay/s6-rc.d/user/contents.d/svc-web
ENV USING_LEGACY_SEPARATE_CONTAINERS=true

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

################# The workers container ##############

FROM aio_builder AS workers

# In the current implemtation, the workers assume the migration
# is done for them.
RUN rm /etc/s6-overlay/s6-rc.d/svc-workers/dependencies.d/init-db-migration \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-workers
ENV USING_LEGACY_SEPARATE_CONTAINERS=true

################# The cli ##############

FROM node:24-slim AS cli
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

COPY --from=base /app/apps/cli/dist/index.mjs apps/cli/index.mjs

WORKDIR /app/apps/cli

ARG SERVER_VERSION=nightly
ENV SERVER_VERSION=${SERVER_VERSION}

ENTRYPOINT ["node", "index.mjs"]

################# MCP server ##############

FROM node:24-slim AS mcp
LABEL org.opencontainers.image.source="https://github.com/karakeep-app/karakeep"
WORKDIR /app

COPY --from=base /app/apps/mcp/dist/index.js apps/mcp/index.js

WORKDIR /app/apps/mcp

ENTRYPOINT ["node", "index.js"]
