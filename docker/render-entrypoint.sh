#!/bin/sh
set -e

# Render private DNS uses the pserv slug (e.g. chrome-c8jj), not the Blueprint
# service name (chrome). Build BROWSER_WEB_URL from fromService host when set.
if [ -z "${BROWSER_WEB_URL:-}" ] && [ -n "${BROWSER_WEB_HOST:-}" ]; then
  export BROWSER_WEB_URL="http://${BROWSER_WEB_HOST}:${BROWSER_WEB_PORT:-9222}"
fi

exec /init "$@"
