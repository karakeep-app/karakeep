import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import type { db } from "@karakeep/db";
import serverConfig from "@karakeep/shared/config";

import { createRateLimitMiddleware } from "./lib/rateLimit";
import {
  apiErrorsTotalCounter,
  apiRequestDurationSummary,
  apiRequestsTotalCounter,
} from "./stats";

interface User {
  id: string;
  name?: string | null | undefined;
  email?: string | null | undefined;
  role: "admin" | "user" | null;
}

export interface Context {
  user: User | null;
  db: typeof db;
  req: {
    ip: string | null;
  };
}

export interface AuthedContext {
  user: User;
  db: typeof db;
  req: {
    ip: string | null;
  };
}

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter(opts) {
    const { shape, error } = opts;
    apiErrorsTotalCounter.inc({
      type: opts.type,
      path: opts.path,
      code: error.code,
    });
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});
export const createCallerFactory = t.createCallerFactory;
// Base router and procedure helpers
export const router = t.router;
export const procedure = t.procedure
  .use(function isDemoMode(opts) {
    if (serverConfig.demoMode && opts.type == "mutation") {
      throw new TRPCError({
        message: "Mutations are not allowed in demo mode",
        code: "FORBIDDEN",
      });
    }
    return opts.next();
  })
  .use(async (opts) => {
    const end = apiRequestDurationSummary.startTimer({
      path: opts.path,
      type: opts.type,
    });
    const res = await opts.next();
    apiRequestsTotalCounter.inc({
      type: opts.type,
      path: opts.path,
      is_error: res.ok ? 0 : 1,
    });
    end();
    return res;
  });

// Default public procedure rate limiting
export const publicProcedure = procedure.use(
  createRateLimitMiddleware({
    name: "globalPublic",
    windowMs: 60 * 1000,
    maxRequests: 1000,
  }),
);

export const authedProcedure = procedure
  // Default authed procedure rate limiting
  .use(
    createRateLimitMiddleware({
      name: "globalAuthed",
      windowMs: 60 * 1000,
      maxRequests: 3000,
    }),
  )
  .use(function isAuthed(opts) {
    const user = opts.ctx.user;

    if (!user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return opts.next({
      ctx: {
        user,
      },
    });
  });

export const adminProcedure = authedProcedure.use(function isAdmin(opts) {
  const user = opts.ctx.user;
  if (user.role != "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return opts.next(opts);
});

// Export the rate limiting middleware for use in routers
export { createRateLimitMiddleware } from "./lib/rateLimit";
