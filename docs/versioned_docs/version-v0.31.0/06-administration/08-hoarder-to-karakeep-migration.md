# Hoarder to Karakeep Migration

Hoarder is rebranding to Karakeep. Due to github limitations, the old docker image might not be getting new updates after the rebranding. You might need to update your docker image to point to the new karakeep image instead by applying the following change in the docker compose file.

```diff
diff --git a/docker/docker-compose.yml b/docker/docker-compose.yml
index cdfc908..6297563 100644
--- a/docker/docker-compose.yml
+++ b/docker/docker-compose.yml
@@ -1,7 +1,7 @@
 version: "3.8"
 services:
   web:
-    image: ghcr.io/hoarder-app/hoarder:${HOARDER_VERSION:-release}
+    image: ghcr.io/karakeep-app/karakeep:${HOARDER_VERSION:-release}
```

You can also change the `HOARDER_VERSION` environment variable but if you do so remember to change it in the `.env` file as well.

## Migrating a Baremetal Installation

If you previously used the [Debian/Ubuntu install script](../02-installation/06-debuntu.md) to install Hoarder, there is an option to migrate your installation to Karakeep.

```bash
bash karakeep-linux.sh migrate
```

This will migrate your installation with no user input required. After the migration, the script will also check for an update.
