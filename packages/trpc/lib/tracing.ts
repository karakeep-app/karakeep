import { SpanKind } from "@opentelemetry/api";

import {
  getTracer,
  setSpanAttributes,
  withSpan,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";

import type { Context } from "../index";

const tracer = getTracer("@karakeep/trpc");

/**
 * tRPC middleware that creates a span for each procedure call.
 * This integrates OpenTelemetry tracing into the tRPC layer.
 */
export function createTracingMiddleware() {
  return async function tracingMiddleware<T>(opts: {
    ctx: Context;
    type: "query" | "mutation" | "subscription";
    path: string;
    input: unknown;
    next: () => Promise<T>;
  }): Promise<T> {
    // Skip if tracing is disabled
    if (!serverConfig.tracing.enabled) {
      return opts.next();
    }

    const spanName = `trpc.${opts.type}.${opts.path}`;

    return withSpan(
      tracer,
      spanName,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "rpc.system": "trpc",
          "rpc.method": opts.path,
          "rpc.type": opts.type,
          "user.id": opts.ctx.user?.id ?? "anonymous",
          "user.role": opts.ctx.user?.role ?? "none",
        },
      },
      async () => {
        return await opts.next();
      },
    );
  };
}

/**
 * Helper to add tracing attributes within a tRPC procedure.
 * Use this to add custom attributes to the current span.
 */
export function addTracingAttributes(
  attributes: Record<string, string | number | boolean>,
): void {
  if (serverConfig.tracing.enabled) {
    setSpanAttributes(attributes);
  }
}
