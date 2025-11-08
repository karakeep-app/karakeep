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
  // Search provider(s)
  await import("@karakeep/plugins/search-meilisearch");
  // Crawler provider - Smart crawler that decides between browser and fetch
  await import("@karakeep/plugins/crawler-smart");
  PluginManager.logAllPlugins();
  pluginsLoaded = true;
}
