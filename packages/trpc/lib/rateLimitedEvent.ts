import type { EventLog, EventLogType } from "@karakeep/shared-server";
import { logEvent } from "@karakeep/shared-server";
import { getRateLimitClient } from "@karakeep/shared/ratelimiting";

type EventFields<F extends EventLogType> = Omit<
  Extract<EventLog, { ["event.name"]: F }>,
  "event.name"
>;

async function checkAndEmit<F extends EventLogType>(
  eventName: F,
  dedupKey: string,
  windowMs: number,
  fields: EventFields<F>,
): Promise<void> {
  const client = await getRateLimitClient();
  if (!client) {
    return;
  }
  const result = await client.checkRateLimit(
    { name: "rate_limited_event", windowMs, maxRequests: 1 },
    dedupKey,
  );
  if (!result.allowed) {
    return;
  }

  logEvent(eventName, fields);
}

export function emitRateLimitedEvent<F extends EventLogType>(
  eventName: F,
  dedupKey: string,
  windowMs: number,
  fields: EventFields<F>,
): void {
  void checkAndEmit(eventName, dedupKey, windowMs, fields).catch(() => {
    // Telemetry must never affect request handling.
  });
}
