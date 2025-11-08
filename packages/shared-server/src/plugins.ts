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
  // Crawler provider(s) - Both are loaded, getCrawlerClient() decides which to use
  await import("@karakeep/plugins/crawler-fetch");
  await import("@karakeep/plugins/crawler-browser");
  PluginManager.logAllPlugins();
  pluginsLoaded = true;
}
