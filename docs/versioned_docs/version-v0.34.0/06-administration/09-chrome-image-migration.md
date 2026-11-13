# Migrating to the Karakeep Chrome Image

Karakeep now publishes its own tested Chrome image instead of relying on the
unmaintained Alpine Chrome image. If you maintain a custom Compose file, update
the `chrome` service with the following diff:

```diff
 services:
   chrome:
-    image: gcr.io/zenika-hub/alpine-chrome:124
+    image: ghcr.io/karakeep-app/karakeep-chrome:release
     restart: unless-stopped
+    init: true
     command:
-      - --no-sandbox
       - --disable-gpu
       - --disable-dev-shm-usage
-      - --remote-debugging-address=0.0.0.0
-      - --remote-debugging-port=9222
       - --hide-scrollbars
       - --disable-blink-features=AutomationControlled
       - --window-size=1440,900
```

Removing the remote-debugging arguments is required. The new image's entrypoint
starts Chrome on an internal port and forwards container port `9222`; overriding
that port conflicts with the forwarding setup. The entrypoint also supplies
`--no-sandbox`, so removing the duplicate Compose argument does not enable the
Chromium sandbox.

The connection used by Karakeep does not change:

```yaml
environment:
  BROWSER_WEB_URL: http://chrome:9222
```

After editing the Compose file, pull and recreate the services:

```bash
docker compose pull chrome
docker compose up -d chrome
```

The migration does not change Karakeep data or require a database migration.
The `release` tag follows the browser image promoted for stable Karakeep
deployments. To control browser upgrades independently, replace `release` with
an immutable versioned tag from the
[Karakeep Chrome package](https://github.com/karakeep-app/karakeep/pkgs/container/karakeep-chrome).
