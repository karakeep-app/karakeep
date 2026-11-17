import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc } from "drizzle-orm";
import { expect, test } from "vitest";
import * as schema from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

// The retained old value must be the previous committed value even when two
// independent processes edit the same bookmark at nearly the same instant.
test("serializes competing file-backed writers into an accurate history chain", async () => {
  const dir = await mkdtemp(
    path.join(tmpdir(), "karakeep-history-concurrency-"),
  );
  const filename = path.join(dir, "db.db"),
    sqlite = new Database(filename);
  try {
    const db = drizzle(sqlite, { schema });
    migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../../db/drizzle", import.meta.url),
      ),
    });
    const user = db
      .insert(schema.users)
      .values({ name: "Owner", email: "owner@test.com" })
      .returning()
      .get();
    const item = db
      .insert(schema.bookmarks)
      .values({ userId: user.id, type: BookmarkTypes.TEXT, title: "Original" })
      .returning()
      .get();
    const worker = fileURLToPath(
      new URL("../testFixtures/historyWriter.ts", import.meta.url),
    );
    await Promise.all(
      ["First", "Second"].map((title) =>
        promisify(execFile)(
          process.execPath,
          ["--import", "tsx", worker, filename, item.id, user.id, title],
          { env: { ...process.env, DATA_DIR: dir } },
        ),
      ),
    );
    const events = db
      .select()
      .from(schema.bookmarkHistory)
      .orderBy(asc(schema.bookmarkHistory.createdAt))
      .all();
    expect(events).toHaveLength(2);
    expect(events[0].changes).toHaveLength(1);
    expect(events[1].changes).toHaveLength(1);
    expect(events[0].changes[0].oldValue).toBe("Original");
    expect(events[1].changes[0].oldValue).toBe(events[0].changes[0].newValue);
    expect(new Set(events.map((e) => e.changes[0].newValue))).toEqual(
      new Set(["First", "Second"]),
    );
  } finally {
    sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
