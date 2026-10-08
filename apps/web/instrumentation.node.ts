import {
  initEventLogger,
  initTracing,
  loadAllPlugins,
} from "@karakeep/shared-server";

await loadAllPlugins();
await initTracing("web");
await initEventLogger("web");
