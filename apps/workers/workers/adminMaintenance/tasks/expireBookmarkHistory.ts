import { inArray, lte } from "drizzle-orm";
import { db } from "@karakeep/db";
import { bookmarkHistory } from "@karakeep/db/schema";
import { AdminMaintenanceQueue } from "@karakeep/shared-server";
import { BOOKMARK_HISTORY_RETENTION_DAYS } from "@karakeep/shared/types/bookmarkHistory";

/**
 * Remove expired rows in bounded batches; API reads enforce the same cutoff
 * independently, so delayed maintenance cannot extend visible retention.
 */
export async function expireHistory() {
  const cutoff = new Date(
    Date.now() - BOOKMARK_HISTORY_RETENTION_DAYS * 86400000,
  );
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (Date.now() > deadline) {
      await AdminMaintenanceQueue.enqueue({ type: "expire_bookmark_history" });
      return;
    }
    const rows = await db
      .select({ id: bookmarkHistory.id })
      .from(bookmarkHistory)
      .where(lte(bookmarkHistory.createdAt, cutoff))
      .limit(500);
    if (!rows.length) return;
    await db.delete(bookmarkHistory).where(
      inArray(
        bookmarkHistory.id,
        rows.map((row) => row.id),
      ),
    );
    // Release the event loop and the SQLite write lock between batches.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
