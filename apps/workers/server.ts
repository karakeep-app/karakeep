import type { HttpBindings } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { printMetrics } from "./metrics";

const app = new Hono()
  .get("/health", (c) =>
    c.json({ status: "ok", timestamp: new Date().toISOString() }),
  )
  .get(
    "/metrics",
    bearerAuth({ token: serverConfig.prometheus.metricsToken }),
    printMetrics,
  );

/**
 * Starts the workers' HTTP server. Extra routes (e.g. the remote crawler's)
 * are mounted at their given base paths.
 */
export function buildServer(
  extraRoutes: Record<string, Hono<{ Bindings: HttpBindings }>> = {},
) {
  const root = new Hono<{ Bindings: HttpBindings }>().route("/", app);
  for (const [basePath, routes] of Object.entries(extraRoutes)) {
    root.route(basePath, routes);
  }
  const server = serve(
    {
      fetch: root.fetch,
      port: serverConfig.workers.port,
      hostname: serverConfig.workers.host,
    },
    (info) => {
      logger.info(`Listening on http://${info.address}:${info.port}`);
    },
  );
  return {
    _server: server,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }),
    serve: () =>
      new Promise<void>((resolve, reject) => {
        server.on("error", reject);
        server.on("close", () => resolve());
      }),
  };
}

export default app;
