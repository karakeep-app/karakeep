import {
  initEventLogger,
  initTracing,
  loadAllPlugins,
} from "@karakeep/shared-server";

await loadAllPlugins();
initTracing("web");
initEventLogger("web");
