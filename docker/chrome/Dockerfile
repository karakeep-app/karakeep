# syntax=docker/dockerfile:1.7

# Google Chrome only ships Linux builds for amd64, so arm64 images fall back to
# Debian's Chromium. Google Chrome is preferred where available: bot-protection
# vendors are much more suspicious of the Chromium build than of Chrome.
ARG DEBIAN_DIGEST=sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

FROM docker.io/library/debian:trixie-slim@${DEBIAN_DIGEST}

ARG TARGETARCH
ARG DEBIAN_DIGEST
ARG GOOGLE_CHROME_VERSION=154.0.8037.57
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED=unknown

LABEL org.opencontainers.image.title="Karakeep Chrome" \
      org.opencontainers.image.description="Headless Chrome tested and distributed for Karakeep" \
      org.opencontainers.image.source="https://github.com/karakeep-app/karakeep" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_CREATED}" \
      org.opencontainers.image.version="${GOOGLE_CHROME_VERSION}" \
      org.opencontainers.image.base.name="docker.io/library/debian:trixie-slim" \
      org.opencontainers.image.base.digest="${DEBIAN_DIGEST}"

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      socat \
      fonts-liberation \
      fonts-noto-core \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
 && if [ "$TARGETARCH" = "amd64" ]; then \
      curl -fsSL -o /tmp/google-chrome.deb \
        "https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${GOOGLE_CHROME_VERSION}-1_amd64.deb" \
      && apt-get install -y --no-install-recommends /tmp/google-chrome.deb \
      && rm /tmp/google-chrome.deb \
      && ln -s /usr/bin/google-chrome-stable /usr/local/bin/karakeep-chrome; \
    else \
      apt-get install -y --no-install-recommends chromium \
      && ln -s /usr/bin/chromium /usr/local/bin/karakeep-chrome; \
    fi \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY --chmod=755 docker/chrome/entrypoint.sh /usr/local/bin/chrome-entrypoint.sh

ENV HOME=/tmp
USER 65534:65534
EXPOSE 9222
ENTRYPOINT ["/usr/local/bin/chrome-entrypoint.sh"]
