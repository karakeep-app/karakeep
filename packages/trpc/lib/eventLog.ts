import type { EventLogType } from "@karakeep/shared-server";
import {
  addLogFields,
  recordEventLogFailure,
  withEventLog,
} from "@karakeep/shared-server";

type TrpcResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

export function createEventLogMiddleware<T extends TrpcResult<unknown>>(
  name: EventLogType,
) {
  return async function eventLogMiddleware(opts: {
    ctx: { user?: { id?: string | null } | null };
    next: () => Promise<T>;
  }) {
    return withEventLog(name, async () => {
      const userId = opts.ctx.user?.id;
      if (userId) {
        addLogFields({ "user.id": userId });
      }
      const result = await opts.next();
      if (!result.ok) {
        recordEventLogFailure(result.error);
      }
      return result;
    });
  };
}
