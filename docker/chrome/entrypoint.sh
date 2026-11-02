#!/bin/sh
# Runs Chrome in (new) headless mode with its DevTools endpoint exposed on port
# 9222. Chrome only binds the DevTools endpoint to localhost, so socat forwards
# the public port to it. Extra Chrome flags are passed as the container command.
set -e

socat TCP4-LISTEN:9222,fork,reuseaddr TCP4:127.0.0.1:9223 &

# Chrome's sandbox needs unprivileged user namespaces, which Docker's default
# seccomp profile blocks, so it's opt-in (see README.md).
if [ "${KARAKEEP_CHROME_SANDBOX:-false}" != "true" ]; then
  set -- --no-sandbox "$@"
fi

# SwiftShader keeps WebGL available without a GPU (even with --disable-gpu);
# a browser without WebGL is an easy headless tell.
# no_new_privs keeps setuid binaries and file capabilities from granting
# Chrome any more privileges.
exec setpriv --no-new-privs karakeep-chrome \
  --headless=new \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir=/tmp/chrome-profile \
  --use-angle=swiftshader \
  --enable-unsafe-swiftshader \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9223 \
  "$@"
