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

export function buildServer() {
  const server = serve(
    {
      fetch: app.fetch,
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
