/**
 * Snapshot script: fetches real bookmarks from a running Karakeep instance
 * and saves them as individual markdown fixtures for the eval suite.
 *
 * Usage:
 *   KARAKEEP_SERVER_ADDR=http://localhost:3000 KARAKEEP_API_KEY=... npx tsx src/snapshot.ts
 *
 * Optionally set SNAPSHOT_LIMIT to control how many bookmarks to fetch (default: 20).
 */
import { createKarakeepClient } from "@karakeep/sdk";
import { htmlToPlainText } from "@karakeep/shared/utils/htmlUtils";
import * as fs from "fs";
import matter from "gray-matter";
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
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
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
        content: c.htmlContent ? htmlToPlainText(c.htmlContent) : null,
      });
    }
    cursor = data?.nextCursor || null;
    hasMore = !!cursor;
  }

  return bookmarks.slice(0, env.SNAPSHOT_LIMIT);
}

function writeFixture(fixturesDir: string, bookmark: SnapshotBookmark): string {
  const slug = slugify(bookmark.title || bookmark.id);
  const filename = `${slug}.md`;

  const frontmatter: Record<string, unknown> = {
    id: bookmark.id,
  };
  if (bookmark.title) frontmatter.title = bookmark.title;
  if (bookmark.url) frontmatter.url = bookmark.url;
  if (bookmark.description) frontmatter.description = bookmark.description;

  const fileContent = matter.stringify(bookmark.content ?? "", frontmatter);
  fs.writeFileSync(path.join(fixturesDir, filename), fileContent);
  return filename;
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

  const fixturesDir = path.join(__dirname, "..", "fixtures", "snapshot");
  fs.mkdirSync(fixturesDir, { recursive: true });

  // Clean existing fixtures
  const existing = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".md"));
  for (const f of existing) {
    fs.unlinkSync(path.join(fixturesDir, f));
  }

  for (const bookmark of bookmarks) {
    const filename = writeFixture(fixturesDir, bookmark);
    console.log(`  ${filename}`);
  }

  console.log(`\nWrote ${bookmarks.length} fixtures to ${fixturesDir}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
