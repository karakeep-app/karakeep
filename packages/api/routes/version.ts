import { Hono } from "hono";

import serverConfig from "@karakeep/shared/config";
import { Context } from "@karakeep/trpc";

const version = new Hono<{
  Variables: {
    ctx: Context;
  };
}>().get("/", (c) => {
  return c.json({
    version: serverConfig.serverVersion ?? "unknown",
  });
});

export default version;
