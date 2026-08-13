import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import type { ContentfulStatusCode } from "hono/utils/http-status";

// trpc maps CLIENT_CLOSED_REQUEST to 499, which isn't part of hono's status
// code union; everything else it emits is a standard contentful 4xx/5xx.
function isContentfulStatusCode(
  status: number,
): status is ContentfulStatusCode {
  return status >= 400 && status <= 511 && status !== 499;
}

const trpcAdapter = createMiddleware(async (c, next) => {
  await next();
  const e = c.error;
  if (e instanceof TRPCError) {
    const status = getHTTPStatusCodeFromError(e);
    const isInternalError = e.code === "INTERNAL_SERVER_ERROR";
    const isProd = process.env.NODE_ENV === "production";
    throw new HTTPException(isContentfulStatusCode(status) ? status : 500, {
      message: isInternalError && isProd ? "Internal server error" : e.message,
      cause: isInternalError && isProd ? undefined : e.cause,
    });
  }
});

export default trpcAdapter;
