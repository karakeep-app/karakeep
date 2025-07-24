import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { AuthedContext, Context, createCallerFactory } from "@karakeep/trpc";
import { appRouter } from "@karakeep/trpc/routers/_app";

const createCaller = createCallerFactory(appRouter);

export const unauthedMiddleware = createMiddleware<{
  Variables: {
    ctx: Context;
    api: ReturnType<typeof createCaller>;
  };
}>(async (c, next) => {
  if (!c.var.ctx) {
    throw new HTTPException(401, {
      message: "Unauthorized",
    });
  }
  c.set("api", createCaller(c.get("ctx")));
  await next();
});

export const authMiddleware = createMiddleware<{
  Variables: {
    ctx: AuthedContext;
    api: ReturnType<typeof createCaller>;
  };
}>(async (c, next) => {
  if (!c.var.ctx || !c.var.ctx.user || c.var.ctx.user === null) {
    throw new HTTPException(401, {
      message: "Unauthorized",
    });
  }
  c.set("api", createCaller(c.get("ctx")));
  await next();
});

export const adminAuthMiddleware = createMiddleware<{
  Variables: {
    ctx: AuthedContext;
    api: ReturnType<typeof createCaller>;
  };
}>(async (c, next) => {
  if (!c.var.ctx || !c.var.ctx.user || c.var.ctx.user === null) {
    throw new HTTPException(401, {
      message: "Unauthorized",
    });
  }

  if (c.var.ctx.user.role !== "admin") {
    throw new HTTPException(403, {
      message: "Forbidden - Admin access required",
    });
  }

  c.set("api", createCaller(c.get("ctx")));
  await next();
});
