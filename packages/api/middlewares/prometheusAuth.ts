import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import serverConfig from "@karakeep/shared/config";

export const prometheusAuthMiddleware = createMiddleware(async (c, next) => {
  const { metricsToken } = serverConfig.prometheus;

  // If no token is configured, deny access (safe default)
  if (!metricsToken) {
    throw new HTTPException(404, {
      message: "Not Found",
    });
  }

  const auth = c.req.header("Authorization");

  if (!auth || !auth.startsWith("Bearer ")) {
    throw new HTTPException(401, {
      message: "Unauthorized",
    });
  }

  const token = auth.slice(7); // Remove "Bearer " prefix

  if (token !== metricsToken) {
    throw new HTTPException(401, {
      message: "Unauthorized",
    });
  }

  await next();
});
