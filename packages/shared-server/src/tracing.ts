import type { Context, Span, Tracer } from "@opentelemetry/api";
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

let tracerProvider: NodeTracerProvider | null = null;
let isInitialized = false;

/**
 * Initialize the OpenTelemetry tracing infrastructure.
 * Should be called once at application startup.
 */
export function initTracing(serviceSuffix?: string): void {
  if (isInitialized) {
    logger.debug("Tracing already initialized, skipping");
    return;
  }

  if (!serverConfig.tracing.enabled) {
    logger.info("Tracing is disabled");
    isInitialized = true;
    return;
  }

  const serviceName = serviceSuffix
    ? `${serverConfig.tracing.serviceName}-${serviceSuffix}`
    : serverConfig.tracing.serviceName;

  logger.info(`Initializing OpenTelemetry tracing for service: ${serviceName}`);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serverConfig.serverVersion ?? "unknown",
  });

  // Configure span processors
  const spanProcessors = [];

  if (serverConfig.tracing.otlpEndpoint) {
    // OTLP exporter (Jaeger, Zipkin, etc.)
    const otlpExporter = new OTLPTraceExporter({
      url: serverConfig.tracing.otlpEndpoint,
    });
    spanProcessors.push(new BatchSpanProcessor(otlpExporter));
    logger.info(
      `OTLP exporter configured: ${serverConfig.tracing.otlpEndpoint}`,
    );
  } else {
    // Fallback to console exporter for development
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    logger.info("Console span exporter configured (no OTLP endpoint set)");
  }

  tracerProvider = new NodeTracerProvider({
    resource,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(serverConfig.tracing.sampleRate),
    }),
    spanProcessors,
  });

  // Register the provider globally
  tracerProvider.register();

  isInitialized = true;
  logger.info("OpenTelemetry tracing initialized successfully");
}

/**
 * Shutdown the tracing infrastructure gracefully.
 * Should be called on application shutdown.
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    logger.info("OpenTelemetry tracing shut down");
  }
}

/**
 * Get a tracer instance for creating spans.
 * @param name - The name of the tracer (typically the module/component name)
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/**
 * Get the currently active span, if any.
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Get the current trace context.
 */
export function getActiveContext(): Context {
  return context.active();
}

/**
 * Execute a function within a new span.
 * Automatically handles error recording and span status.
 */
export async function withSpan<T>(
  tracer: Tracer,
  spanName: string,
  options: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  },
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    spanName,
    {
      kind: options.kind ?? SpanKind.INTERNAL,
      attributes: options.attributes,
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Execute a synchronous function within a new span.
 */
export function withSpanSync<T>(
  tracer: Tracer,
  spanName: string,
  options: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  },
  fn: (span: Span) => T,
): T {
  const span = tracer.startSpan(spanName, {
    kind: options.kind ?? SpanKind.INTERNAL,
    attributes: options.attributes,
  });

  try {
    const result = context.with(trace.setSpan(context.active(), span), () =>
      fn(span),
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add an event to the current active span.
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set attributes on the current active span.
 */
export function setSpanAttributes(
  attributes: Record<string, string | number | boolean>,
): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an error on the current active span.
 */
export function recordSpanError(error: Error): void {
  const span = getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

/**
 * Extract trace context from HTTP headers (for distributed tracing).
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>,
): Context {
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      normalizedHeaders[key] = Array.isArray(value) ? value[0] : value;
    }
  }
  return propagation.extract(context.active(), normalizedHeaders);
}

/**
 * Inject trace context into HTTP headers (for distributed tracing).
 */
export function injectTraceContext(
  headers: Record<string, string>,
): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}

/**
 * Run a function within a specific context.
 */
export function runWithContext<T>(ctx: Context, fn: () => T): T {
  return context.with(ctx, fn);
}

// Re-export commonly used types and constants
export { SpanKind, SpanStatusCode } from "@opentelemetry/api";
