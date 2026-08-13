# syntax=docker/dockerfile:1.7

ARG HEADLESS_SHELL_VERSION=151.0.7922.47
ARG HEADLESS_SHELL_DIGEST=sha256:dabddca3d1b3d95f0004bd16c62e581b701e313b41cce1e36606db1bbac06db2

FROM docker.io/chromedp/headless-shell:${HEADLESS_SHELL_VERSION}@${HEADLESS_SHELL_DIGEST}

ARG HEADLESS_SHELL_VERSION
ARG HEADLESS_SHELL_DIGEST
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED=unknown

LABEL org.opencontainers.image.title="Karakeep Chrome" \
      org.opencontainers.image.description="Chrome Headless Shell tested and distributed for Karakeep" \
      org.opencontainers.image.source="https://github.com/karakeep-app/karakeep" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_CREATED}" \
      org.opencontainers.image.version="${HEADLESS_SHELL_VERSION}" \
      org.opencontainers.image.base.name="docker.io/chromedp/headless-shell:${HEADLESS_SHELL_VERSION}" \
      org.opencontainers.image.base.digest="${HEADLESS_SHELL_DIGEST}"

USER 65534:65534
