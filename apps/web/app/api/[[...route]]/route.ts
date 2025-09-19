import { createContextFromRequest } from "@/server/api/client";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { handle } from "hono/vercel";

import allApp from "@karakeep/api";
import { Context } from "@karakeep/trpc";

export const runtime = "nodejs";

export const nextAuth = createMiddleware<{
  Variables: {
    ctx: Context;
  };
}>(async (c, next) => {
  const ctx = await createContextFromRequest(c.req.raw);
  c.set("ctx", ctx);
  await next();
});

const app = new Hono().basePath("/api").use(nextAuth).route("/", allApp);

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
export const PUT = handle(app);
