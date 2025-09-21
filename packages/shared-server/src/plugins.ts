import { PluginManager } from "@karakeep/shared/plugins";

let pluginsLoaded = false;
export async function loadAllPlugins() {
  if (pluginsLoaded) {
    return;
  }
  // Load plugins here. Order of plugin loading matter.
  // Queue provider(s)
  await import("@karakeep/plugins-queue-liteque");
  await import("@karakeep/plugins-search-meilisearch");
  // Rate limiter providers (memory first, then redis to override if configured)
  await import("@karakeep/plugins-ratelimiter-memory");
  await import("@karakeep/plugins-ratelimiter-redis");
  PluginManager.logAllPlugins();
  pluginsLoaded = true;
}
