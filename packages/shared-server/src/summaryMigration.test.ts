import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import {
  bookmarkLinks,
  bookmarks,
  summaryProcessing,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const migrationsFolder = path.resolve(import.meta.dirname, "../../db/drizzle");

describe("summary processing migration", () => {
  it("creates summary state on a fresh database", () => {
    const db = getInMemoryDB(true);
    expect(db.select().from(summaryProcessing).all()).toEqual([]);
  });

  it("upgrades existing data without changing original content or summary", () => {
    const folder = mkdtempSync(
      path.join(tmpdir(), "karakeep-summary-migration-"),
    );
    try {
      cpSync(migrationsFolder, folder, { recursive: true });
      const journalPath = path.join(folder, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8"));
      expect(journal.entries.pop().tag).toBe("0099_summary_tags");
      expect(journal.entries.pop().tag).toBe("0098_summary_progress");
      expect(journal.entries.pop().tag).toBe("0097_summary_processing");
      writeFileSync(journalPath, JSON.stringify(journal));
      const db = getInMemoryDB(false);
      migrate(db, { migrationsFolder: folder });
      db.run(sql`PRAGMA foreign_keys = ON`);
      db.insert(users)
        .values({ id: "owner", name: "Owner", email: "owner@test.local" })
        .run();
      db.insert(bookmarks)
        .values({
          id: "saved",
          userId: "owner",
          type: BookmarkTypes.LINK,
          summary: "Existing summary",
        })
        .run();
      db.insert(bookmarkLinks)
        .values({
          id: "saved",
          url: "https://example.com/article",
          htmlContent: "<p>Original</p>",
        })
        .run();
      const before = db.select().from(bookmarks).all();
      const originals = db.select().from(bookmarkLinks).all();
      migrate(db, { migrationsFolder });
      expect(db.select().from(bookmarks).all()).toEqual(before);
      expect(db.select().from(bookmarkLinks).all()).toEqual(originals);
      expect(db.select().from(summaryProcessing).all()).toEqual([]);
      db.insert(summaryProcessing)
        .values({
          bookmarkId: "saved",
          userId: "owner",
          generation: "attempt",
          sourceUrl: originals[0]!.url,
          sourceVersion: "hash",
          sourceType: "article",
          status: "pending",
          updatedAt: new Date(),
        })
        .run();
      db.delete(bookmarks).run();
      expect(db.select().from(summaryProcessing).all()).toEqual([]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

it("adds progress fields to an existing summary without changing its publication or original", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "karakeep-summary-progress-"));
  try {
    cpSync(migrationsFolder, folder, { recursive: true });
    const journalPath = path.join(folder, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    expect(journal.entries.pop().tag).toBe("0099_summary_tags");
    expect(journal.entries.pop().tag).toBe("0098_summary_progress");
    writeFileSync(journalPath, JSON.stringify(journal));
    const db = getInMemoryDB(false);
    migrate(db, { migrationsFolder: folder });
    db.run(
      sql`INSERT INTO user (id, name, email) VALUES ('owner', 'Owner', 'owner@test.local')`,
    );
    db.insert(bookmarks)
      .values({
        id: "saved",
        userId: "owner",
        type: BookmarkTypes.LINK,
        summary: "# Existing summary",
      })
      .run();
    db.run(
      sql`INSERT INTO bookmarkLinks (id, url, htmlContent) VALUES ('saved', 'https://example.com', '<p>Original</p>')`,
    );
    db.run(
      sql`INSERT INTO summaryProcessing (bookmarkId,userId,generation,sourceUrl,sourceVersion,sourceType,status,provider,summaryHash,updatedAt) VALUES ('saved','owner','generation','https://example.com','version','article','success','notebooklm','hash',123)`,
    );
    const original = db.select().from(bookmarkLinks).get();
    migrate(db, { migrationsFolder });
    expect(db.select().from(summaryProcessing).get()).toMatchObject({
      status: "success",
      stage: "success",
      generation: "generation",
      provider: "notebooklm",
      summaryHash: "hash",
      retryCount: 0,
      nextRetryAt: null,
      notebookErrorCode: null,
    });
    expect(db.select().from(bookmarkLinks).get()).toEqual(original);
    expect(db.select().from(bookmarks).get()?.summary).toBe(
      "# Existing summary",
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("upgrades summary tags state from migration 0098 without altering existing tags or summaries", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "karakeep-summary-tags-"));
  try {
    cpSync(migrationsFolder, folder, { recursive: true });
    const journalPath = path.join(folder, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    expect(journal.entries.pop().tag).toBe("0099_summary_tags");
    writeFileSync(journalPath, JSON.stringify(journal));
    const db = getInMemoryDB(false);
    migrate(db, { migrationsFolder: folder });
    db.insert(users)
      .values({ id: "owner", name: "Owner", email: "owner@test.local" })
      .run();
    db.insert(bookmarks)
      .values({
        id: "saved",
        userId: "owner",
        type: BookmarkTypes.LINK,
        summary: "# Existing summary",
        taggingStatus: "success",
      })
      .run();
    db.insert(bookmarkLinks)
      .values({
        id: "saved",
        url: "https://example.com",
        htmlContent: "Original",
      })
      .run();
    db.run(
      sql`INSERT INTO bookmarkTags (id, name, userId, createdAt) VALUES ('manual','мой тег','owner',123)`,
    );
    db.run(
      sql`INSERT INTO tagsOnBookmarks (bookmarkId,tagId,attachedBy) VALUES ('saved','manual','human')`,
    );
    db.run(
      sql`INSERT INTO summaryProcessing (bookmarkId,userId,generation,sourceUrl,sourceVersion,sourceType,status,provider,summaryHash,updatedAt,stage) VALUES ('saved','owner','generation','https://example.com','version','article','success','notebooklm','hash',123,'success')`,
    );
    migrate(db, { migrationsFolder });
    expect(db.select().from(summaryProcessing).get()).toMatchObject({
      status: "success",
      summaryHash: "hash",
      taggingStatus: null,
      taggingErrorCode: null,
      taggedSummaryHash: null,
    });
    expect(db.select().from(bookmarks).get()).toMatchObject({
      summary: "# Existing summary",
      taggingStatus: "success",
    });
    expect(db.all(sql`SELECT attachedBy FROM tagsOnBookmarks`)).toEqual([
      { attachedBy: "human" },
    ]);
    expect(db.select().from(bookmarkLinks).get()?.htmlContent).toBe("Original");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
