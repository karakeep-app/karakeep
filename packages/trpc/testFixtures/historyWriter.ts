// Separate processes exercise SQLite's actual write locking, rather than sharing
// the single in-memory connection used by the router test harness.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@karakeep/db/schema";
import { historyTransaction } from "../lib/bookmarkHistory";

const [filename, bookmarkId, userId, title] = process.argv.slice(2);
const sqlite = new Database(filename);
sqlite.pragma("busy_timeout = 10000");
const db = drizzle(sqlite, { schema });
historyTransaction(
  {
    db,
    user: { id: userId, role: "user" },
    auth: { type: "session" },
    req: { ip: null },
  },
  () => [bookmarkId],
  (tx) => {
    // Hold the write lock long enough for the competing process to contend.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    tx.update(schema.bookmarks)
      .set({ title })
      .where(eq(schema.bookmarks.id, bookmarkId))
      .run();
  },
);
sqlite.close();
