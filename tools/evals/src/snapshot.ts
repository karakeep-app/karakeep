/**
 * Snapshot script: fetches real bookmarks from a running Karakeep instance
 * and saves them as JSON fixtures for the eval suite.
 *
 * Usage:
 *   KARAKEEP_SERVER_ADDR=http://localhost:3000 KARAKEEP_API_KEY=... npx tsx src/snapshot.ts
 *
 * Optionally set SNAPSHOT_LIMIT to control how many bookmarks to fetch (default: 20).
 */
import { createKarakeepClient } from "@karakeep/sdk";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

const envSchema = z.object({
  KARAKEEP_SERVER_ADDR: z.string().url(),
  KARAKEEP_API_KEY: z.string().min(1),
  SNAPSHOT_LIMIT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
});

const env = envSchema.parse(process.env);

interface SnapshotBookmark {
  id: string;
  title: string | null;
  url: string | null;
  description: string | null;
  content: string | null;
  existingAiTags: string[];
  existingHumanTags: string[];
}

async function fetchBookmarks(): Promise<SnapshotBookmark[]> {
  const client = createKarakeepClient({
    baseUrl: `${env.KARAKEEP_SERVER_ADDR}/api/v1/`,
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${env.KARAKEEP_API_KEY}`,
    },
  });

  const bookmarks: SnapshotBookmark[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore && bookmarks.length < env.SNAPSHOT_LIMIT) {
    const params: {
      limit: number;
      includeContent: true;
      archived?: boolean;
      cursor?: string;
    } = {
      limit: Math.min(env.SNAPSHOT_LIMIT - bookmarks.length, 50),
      includeContent: true,
      archived: false,
    };

    if (cursor) {
      params.cursor = cursor;
    }

    const { data, error } = await client.GET("/bookmarks", {
      params: { query: params },
    });

    if (error) {
      throw new Error(`Failed to fetch bookmarks: ${String(error)}`);
    }

    for (const b of data?.bookmarks || []) {
      const c = b.content;
      if (c?.type !== "link") continue;
      if (!c.htmlContent && !c.description) continue;
      bookmarks.push({
        id: b.id,
        title: b.title || c.title || null,
        url: c.url ?? null,
        description: c.description ?? null,
        content: c.htmlContent ?? null,
        existingAiTags: (b.tags || [])
          .filter((t) => t.attachedBy === "ai")
          .map((t) => t.name),
        existingHumanTags: (b.tags || [])
          .filter((t) => t.attachedBy === "human")
          .map((t) => t.name),
      });
    }
    cursor = data?.nextCursor || null;
    hasMore = !!cursor;
  }

  return bookmarks.slice(0, env.SNAPSHOT_LIMIT);
}

async function main() {
  console.log(
    `Fetching up to ${env.SNAPSHOT_LIMIT} bookmarks from ${env.KARAKEEP_SERVER_ADDR}...`,
  );

  const bookmarks = await fetchBookmarks();
  console.log(`Fetched ${bookmarks.length} bookmarks with content.`);

  if (bookmarks.length === 0) {
    console.error(
      "No bookmarks with content found. Make sure you have link bookmarks with crawled content.",
    );
    process.exit(1);
  }

  const outPath = path.join(__dirname, "..", "fixtures", "bookmarks.json");
  fs.writeFileSync(outPath, JSON.stringify(bookmarks, null, 2) + "\n");
  console.log(`Wrote ${bookmarks.length} bookmarks to ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
