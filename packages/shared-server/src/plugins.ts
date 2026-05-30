import { PluginManager } from "@karakeep/shared/plugins";

const pluginLoaderStateKey = "__karakeep_plugins_loader_state__";

const globalPluginLoaderState = globalThis as typeof globalThis & {
  [pluginLoaderStateKey]?: {
    loaded: boolean;
    loading?: Promise<void>;
  };
};

const pluginLoaderState = (globalPluginLoaderState[pluginLoaderStateKey] ??= {
  loaded: false,
});

export async function loadAllPlugins() {
  if (pluginLoaderState.loaded) {
    return;
  }
  if (pluginLoaderState.loading) {
    await pluginLoaderState.loading;
    return;
  }
  pluginLoaderState.loading = (async () => {
    // Load plugins here. Order of plugin loading matter.
    // Queue provider(s)
    await import("@karakeep/plugins/queue-liteque");
    await import("@karakeep/plugins/queue-restate");
    await import("@karakeep/plugins/search-meilisearch");
    // Rate limiters (order matters - last one wins)
    await import("@karakeep/plugins/ratelimit-memory");
    await import("@karakeep/plugins/ratelimit-redis");
    PluginManager.logAllPlugins();
    pluginLoaderState.loaded = true;
  })();

  try {
    await pluginLoaderState.loading;
  } finally {
    pluginLoaderState.loading = undefined;
  }
}
