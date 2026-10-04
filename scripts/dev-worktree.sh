#!/usr/bin/env bash

# Sets up and runs the dev env (web + workers) for a single git worktree, without
# clashing with dev envs running from other worktrees on the same machine.
#
# Usage:
#   pnpm dev:worktree          # set up, migrate, then run web + workers until stopped
#   pnpm dev:worktree setup    # set up and migrate only
#
# Env overrides:
#   PORT               web port (default: first free port in 3100-3199)
#   DEV_HOST           hostname the browser uses to reach the app (default: localhost).
#                      Set it when the browser can't use localhost (e.g. a LAN IP).
#   WATCHPACK_POLLING  poll for file changes instead of native watching (default: true,
#                      because native watching fails inside the Claude Code sandbox)
#
# Scripts run through `node --import tsx` rather than the tsx CLI, because the tsx CLI
# opens an IPC socket that sandboxes can block.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WORKTREE_ID="$(basename "$ROOT")"
LOG_DIR="${TMPDIR:-/tmp}/karakeep-dev-$WORKTREE_ID"

log() {
    printf '==> %s\n' "$*"
}

setup() {
    if [ ! -d node_modules ]; then
        log "Installing dependencies"
        pnpm install
    fi

    # A random secret per worktree means session cookies left behind by other
    # worktrees (cookies are shared across localhost ports) are rejected instead
    # of silently logging you in.
    if ! grep -qs "^NEXTAUTH_SECRET=" .env; then
        log "Adding a random NEXTAUTH_SECRET to .env"
        echo "NEXTAUTH_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" >>.env
    fi
    if ! grep -qs "^DATA_DIR=" .env; then
        log "Adding DATA_DIR to .env"
        echo "DATA_DIR=$ROOT/data" >>.env
    fi
    for dir in apps/web apps/workers packages/db; do
        if [ ! -e "$dir/.env" ]; then
            ln -s "$ROOT/.env" "$dir/.env"
        fi
    done

    if [ ! -d data ]; then
        log "Applying the seed snapshot"
        (cd tools/seed-snapshot && node --import tsx src/apply.ts)
    fi

    log "Migrating the database"
    (cd packages/db && node --import tsx migrate.ts)
    log "Migrating the queue"
    (cd apps/workers && node --import tsx scripts/migrateQueue.ts)
}

port_in_use() {
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pick_port() {
    local port
    for port in $(seq 3100 3199); do
        if ! port_in_use "$port"; then
            echo "$port"
            return
        fi
    done
}

WEB_PID=""
WORKERS_PID=""

cleanup() {
    trap - EXIT INT TERM
    log "Stopping web and workers"
    # Each service runs in its own process group (set -m), so this also stops
    # the processes they spawn (pnpm -> next -> next-server).
    if [ -n "$WEB_PID" ]; then kill -- "-$WEB_PID" 2>/dev/null || true; fi
    if [ -n "$WORKERS_PID" ]; then kill -- "-$WORKERS_PID" 2>/dev/null || true; fi
    wait 2>/dev/null || true
}

# Prints the tail of the log of whichever process died and exits.
fail_if_dead() {
    local name pid
    for name in web workers; do
        if [ "$name" = web ]; then pid=$WEB_PID; else pid=$WORKERS_PID; fi
        if ! kill -0 "$pid" 2>/dev/null; then
            log "The $name process exited. Last lines of $LOG_DIR/$name.log:"
            tail -n 30 "$LOG_DIR/$name.log"
            exit 1
        fi
    done
}

start() {
    if [ -z "${PORT:-}" ]; then
        PORT="$(pick_port)"
        if [ -z "$PORT" ]; then
            log "No free port in 3100-3199"
            exit 1
        fi
    elif port_in_use "$PORT"; then
        log "Port $PORT is already in use"
        exit 1
    fi

    # NEXTAUTH_URL must match the URL the browser uses, or sign-in and sign-out
    # requests go to whatever is running on the default (localhost:3000).
    local host="${DEV_HOST:-localhost}"
    export PORT
    export NEXTAUTH_URL="http://$host:$PORT"
    export WATCHPACK_POLLING="${WATCHPACK_POLLING:-true}"
    if [ "$host" != localhost ]; then
        # Next blocks dev resources (HMR, fonts) for origins other than localhost.
        export ALLOWED_DEV_ORIGINS="${ALLOWED_DEV_ORIGINS:+$ALLOWED_DEV_ORIGINS,}$host"
    fi

    mkdir -p "$LOG_DIR"
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    set -m

    log "Starting workers (log: $LOG_DIR/workers.log)"
    (cd apps/workers && exec node --import tsx index.ts) >"$LOG_DIR/workers.log" 2>&1 &
    WORKERS_PID=$!

    log "Starting web on port $PORT (log: $LOG_DIR/web.log)"
    (cd apps/web && exec pnpm exec next dev) >"$LOG_DIR/web.log" 2>&1 &
    WEB_PID=$!

    log "Waiting for the web app (the first compile can take a minute)"
    local deadline=$((SECONDS + 300)) code
    while :; do
        fail_if_dead
        code="$(curl -s -o /dev/null -m 60 -w '%{http_code}' "http://localhost:$PORT/signin" || true)"
        if [ "$code" = 200 ]; then
            break
        fi
        if [ "$SECONDS" -ge "$deadline" ]; then
            log "The web app didn't become ready within 5 minutes (last status: $code)"
            exit 1
        fi
        sleep 2
    done

    cat <<EOF

Karakeep is ready at $NEXTAUTH_URL

Seed users (password: test1234):
  test1@example.com  admin, 20 bookmarks
  test2@example.com  user, 4 bookmarks
  test3@example.com  user, no data

Logs:
  $LOG_DIR/web.log
  $LOG_DIR/workers.log

Press Ctrl+C to stop.
EOF

    while :; do
        fail_if_dead
        sleep 2
    done
}

case "${1:-start}" in
    setup)
        setup
        ;;
    start)
        setup
        start
        ;;
    *)
        echo "Usage: $0 [setup|start]" >&2
        exit 1
        ;;
esac
