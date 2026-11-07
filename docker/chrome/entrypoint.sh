#!/bin/sh
# Runs Chrome in (new) headless mode with its DevTools endpoint exposed on port
# 9222. Chrome only binds the DevTools endpoint to localhost, so socat forwards
# the public port to it. Extra Chrome flags are passed as the container command.
set -e

# Listen on IPv6 and IPv4 separately (ipv6only=1) so both binds succeed
# regardless of start order. On hosts with IPv6 disabled, the IPv6 listener
# fails and the IPv4 one keeps working.
socat TCP6-LISTEN:9222,fork,reuseaddr,ipv6only=1 TCP4:127.0.0.1:9223 &
socat TCP4-LISTEN:9222,fork,reuseaddr TCP4:127.0.0.1:9223 &

# SwiftShader keeps WebGL available without a GPU (even with --disable-gpu);
# a browser without WebGL is an easy headless tell.
exec karakeep-chrome \
  --headless=new \
  --no-sandbox \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir=/tmp/chrome-profile \
  --use-angle=swiftshader \
  --enable-unsafe-swiftshader \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9223 \
  "$@"
