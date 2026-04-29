import { AsyncLocalStorage } from "node:async_hooks";

import { TRPCError } from "@trpc/server";
import { context } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import winston from "winston";
import type { EventLog, EventLogType } from "./eventLogTypes";

import serverConfig from "@karakeep/shared/config";
import appLogger from "@karakeep/shared/logger";

interface LogEventContext {
  name: string;
  fields: Map<string, unknown>;
  startTime: number;
  error?: unknown;
}

interface EventLoggerState {
  eventStorage: AsyncLocalStorage<LogEventContext>;
  winstonLogger: winston.Logger | null;
  loggerProvider: LoggerProvider | null;
  isInitialized: boolean;
}

declare global {
  // Next.js can bundle this module into multiple server chunks. Keeping the
  // initialized logger state on globalThis lets instrumentation and routes share
  // the same logger instance.
  // eslint-disable-next-line no-var
  var __karakeepEventLogger: EventLoggerState | undefined;
}

type EventLogFields<T extends EventLogType> = Omit<
  Extract<EventLog, { ["event.name"]: T }>,
  "event.name"
>;

const eventLoggerState =
  globalThis.__karakeepEventLogger ??
  (globalThis.__karakeepEventLogger = {
    eventStorage: new AsyncLocalStorage<LogEventContext>(),
    winstonLogger: null,
    loggerProvider: null,
    isInitialized: false,
  });

export function initEventLogger(serviceSuffix?: string): void {
  if (eventLoggerState.isInitialized) {
    appLogger.debug("Event logger already initialized, skipping");
    return;
  }

  if (!serverConfig.eventLogs.enabled) {
    appLogger.info("Event logging is disabled");
    eventLoggerState.isInitialized = true;
    return;
  }

  const serviceName = serviceSuffix
    ? `${serverConfig.tracing.serviceName}-${serviceSuffix}`
    : serverConfig.tracing.serviceName;

  appLogger.info(`Initializing event logger for service: ${serviceName}`);

  let transport: winston.transport = new winston.transports.Console();

  const otlpEndpoint = serverConfig.eventLogs.otlpExport.enabled
    ? serverConfig.eventLogs.otlpExport.endpoint
    : undefined;
  if (otlpEndpoint) {
    const endpoint = otlpEndpoint;
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serverConfig.serverVersion ?? "unknown",
    });

    const logExporter = new OTLPLogExporter({ url: endpoint });

    eventLoggerState.loggerProvider = new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor(logExporter)],
    });

    // Register globally so OpenTelemetryTransportV3 can pick it up
    logs.setGlobalLoggerProvider(eventLoggerState.loggerProvider);

    // if OTEL is enabled, let's only log to OTEL
    transport = new OpenTelemetryTransportV3();

    appLogger.info(`Event logs OTLP exporter configured: ${endpoint}`);
  }

  eventLoggerState.winstonLogger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    transports: [transport],
  });

  eventLoggerState.isInitialized = true;
  appLogger.info("Event logger initialized successfully");
}

export async function shutdownEventLogger(): Promise<void> {
  if (eventLoggerState.loggerProvider) {
    await eventLoggerState.loggerProvider.shutdown();
    eventLoggerState.loggerProvider = null;
    appLogger.info("Event logger shut down");
  }
}

export async function withEventLog<T, F extends EventLog["event.name"]>(
  name: F,
  fn: () => Promise<T>,
  fields?: EventLogFields<F>,
): Promise<T> {
  if (!eventLoggerState.winstonLogger) {
    return fn();
  }

  const event: LogEventContext = {
    name,
    fields: new Map(Object.entries(fields ?? {})),
    startTime: Date.now(),
  };

  return eventLoggerState.eventStorage.run(event, async () => {
    let error: unknown;
    try {
      const result = await fn();
      return result;
    } catch (e) {
      event.error = e;
      throw e;
    } finally {
      const durationSeconds = (Date.now() - event.startTime) / 1000;
      error = event.error;
      const hasError = error !== undefined;

      const record: Record<string, unknown> = {
        ["event.name"]: event.name,
        duration: durationSeconds,
        ...Object.fromEntries(event.fields),
      };

      if (hasError) {
        if (error instanceof Error) {
          record["exception.type"] = error.constructor.name;
          record["exception.message"] = error.message;
          if (error.stack) {
            record["exception.stacktrace"] = error.stack;
          }
          if (error instanceof TRPCError) {
            record["trpc.error_code"] = error.code;
          }
        } else {
          record["exception.type"] = typeof error;
          record["exception.message"] = String(error);
        }
      }

      // Emit within the active OTel context so the transport can
      // correlate with the current trace/span automatically.
      const activeCtx = context.active();
      context.with(activeCtx, () => {
        eventLoggerState.winstonLogger!.log(hasError ? "error" : "info", {
          ...record,
        });
      });
    }
  });
}

export function logEvent(event: EventLog): void;
export function logEvent<F extends EventLogType>(
  name: F,
  fields: EventLogFields<F>,
): void;
export function logEvent(
  ...args: [EventLog] | [EventLogType, Record<string, unknown>]
): void {
  if (!eventLoggerState.winstonLogger) {
    return;
  }

  const record: Record<string, unknown> =
    args.length === 1 ? { ...args[0] } : { "event.name": args[0], ...args[1] };

  // Emit within the active OTel context so the transport can
  // correlate with the current trace/span automatically.
  const activeCtx = context.active();
  context.with(activeCtx, () => {
    eventLoggerState.winstonLogger!.log("info", record);
  });
}

export function addLogFields<T extends EventLogType>(
  fields: Partial<EventLogFields<T>>,
): void {
  const event = eventLoggerState.eventStorage.getStore();
  if (event) {
    for (const [key, value] of Object.entries(fields)) {
      event.fields.set(key, value);
    }
  }
}

export function recordEventLogFailure(error: unknown): void {
  const event = eventLoggerState.eventStorage.getStore();
  if (event) {
    event.error = error;
  }
}
