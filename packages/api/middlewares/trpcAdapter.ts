import { TRPCError } from "@trpc/server";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

function trpcCodeToHttpCode(code: TRPCError["code"]) {
  switch (code) {
    case "BAD_REQUEST":
    case "PARSE_ERROR":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_SUPPORTED":
      return 405;
    case "TIMEOUT":
      return 408;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "INTERNAL_SERVER_ERROR":
      return 500;
    default:
      return 500;
  }
}

const trpcAdapter = createMiddleware(async (c, next) => {
  await next();
  const e = c.error;
  if (e instanceof TRPCError) {
    const code = trpcCodeToHttpCode(e.code);
    throw new HTTPException(code, {
      message: e.message,
      cause: e.cause,
    });
  }
});

export default trpcAdapter;
