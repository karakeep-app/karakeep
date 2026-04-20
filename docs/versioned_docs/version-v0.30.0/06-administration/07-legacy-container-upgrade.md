# Legacy Container Upgrade

Karakeep's 0.16 release consolidated the web and worker containers into a single container and also dropped the need for the redis container. The legacy containers will stop being supported soon, to upgrade to the new container do the following:

1. Remove the redis container and its volume if it had one.
2. Move the environment variables that you've set exclusively to the `workers` container to the `web` container.
3. Delete the `workers` container.
4. Rename the web container image from `hoarder-app/hoarder-web` to `hoarder-app/hoarder`.

```diff
diff --git a/docker/docker-compose.yml b/docker/docker-compose.yml
index cdfc908..6297563 100644
--- a/docker/docker-compose.yml
+++ b/docker/docker-compose.yml
@@ -1,7 +1,7 @@
 version: "3.8"
 services:
   web:
-    image: ghcr.io/hoarder-app/hoarder-web:${KARAKEEP_VERSION:-release}
+    image: ghcr.io/karakeep-app/karakeep:${KARAKEEP_VERSION:-release}
     restart: unless-stopped
     volumes:
       - data:/data
@@ -10,14 +10,10 @@ services:
     env_file:
       - .env
     environment:
-      REDIS_HOST: redis
       MEILI_ADDR: http://meilisearch:7700
+      BROWSER_WEB_URL: http://chrome:9222
+      # OPENAI_API_KEY: ...
       DATA_DIR: /data
-  redis:
-    image: redis:7.2-alpine
-    restart: unless-stopped
-    volumes:
-      - redis:/data
   chrome:
     image: gcr.io/zenika-hub/alpine-chrome:123
     restart: unless-stopped
@@ -37,24 +33,7 @@ services:
       MEILI_NO_ANALYTICS: "true"
     volumes:
       - meilisearch:/meili_data
-  workers:
-    image: ghcr.io/hoarder-app/hoarder-workers:${KARAKEEP_VERSION:-release}
-    restart: unless-stopped
-    volumes:
-      - data:/data
-    env_file:
-      - .env
-    environment:
-      REDIS_HOST: redis
-      MEILI_ADDR: http://meilisearch:7700
-      BROWSER_WEB_URL: http://chrome:9222
-      DATA_DIR: /data
-      # OPENAI_API_KEY: ...
-    depends_on:
-      web:
-        condition: service_started

 volumes:
-  redis:
   meilisearch:
   data:
```
