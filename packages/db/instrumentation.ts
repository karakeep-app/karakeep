import type Database from "better-sqlite3";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

const TRACER_NAME = "@karakeep/db";

function getOperationType(sql: string): string {
  return sql.trimStart().split(/\s/, 1)[0]?.toUpperCase() ?? "UNKNOWN";
}

/**
 * Instruments a better-sqlite3 Database instance with OpenTelemetry tracing.
 *
 * Wraps `prepare()` so that every `run()`, `get()`, and `all()` call on
 * the returned Statement produces an OTel span with db.system, db.statement,
 * and db.operation attributes.
 *
 * The instrumentation is a no-op when no OTel TracerProvider is registered
 * (i.e. when tracing is disabled), following standard OTel conventions.
 */
export function instrumentDatabase(
  sqlite: Database.Database,
): Database.Database {
  const tracer = trace.getTracer(TRACER_NAME);
  const origPrepare = sqlite.prepare.bind(sqlite);

  sqlite.prepare = function (sql: string) {
    const stmt = origPrepare(sql);
    const operation = getOperationType(sql);
    const spanName = `db.${operation.toLowerCase()}`;

    for (const method of ["run", "get", "all"] as const) {
      type QueryFn = (...args: unknown[]) => unknown;
      const original = (stmt[method] as QueryFn).bind(stmt);
      (stmt[method] as QueryFn) = function (...args: unknown[]) {
        const span = tracer.startSpan(spanName, {
          kind: SpanKind.CLIENT,
          attributes: {
            "db.system": "sqlite",
            "db.statement": sql,
            "db.operation": operation,
          },
        });

        try {
          const result = original(...args);
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
      };
    }

    return stmt;
  } as typeof sqlite.prepare;

  return sqlite;
}
