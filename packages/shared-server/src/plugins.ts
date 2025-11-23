import { PluginManager } from "@karakeep/shared/plugins";

let pluginsLoaded = false;
export async function loadAllPlugins() {
  if (pluginsLoaded) {
    return;
  }
  // Load plugins here. Order of plugin loading matter.
  // Queue provider(s)
  await import("@karakeep/plugins/queue-liteque");
  await import("@karakeep/plugins/queue-restate");
  await import("@karakeep/plugins/search-meilisearch");
  await import("@karakeep/plugins/ratelimit-memory");
  PluginManager.logAllPlugins();
  pluginsLoaded = true;
}
