import * as fs from "fs";
import * as path from "path";

import type { ZTagStyle } from "@karakeep/shared/types/users";

export interface SnapshotBookmark {
  id: string;
  title: string | null;
  url: string | null;
  description: string | null;
  content: string | null;
  existingAiTags: string[];
  existingHumanTags: string[];
}

export interface EvalFixture {
  id: string;
  description: string;
  content: string;
  lang: string;
  tagStyle: ZTagStyle;
  customPrompts: string[];
  curatedTags?: string[];
  /** Whether we expect the tags array to be empty */
  expectEmpty: boolean;
  minTags?: number;
  maxTags?: number;
  /** Override the default context length for truncation tests */
  contextLength?: number;
}

// ── Load snapshot bookmarks ─────────────────────────────────────────────

function loadSnapshotBookmarks(): SnapshotBookmark[] {
  const fixturesPath = path.join(__dirname, "..", "fixtures", "bookmarks.json");
  if (!fs.existsSync(fixturesPath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));
}

function bookmarkToContent(b: SnapshotBookmark): string {
  const parts: string[] = [];
  if (b.url) parts.push(`URL: ${b.url}`);
  if (b.title) parts.push(`Title: ${b.title}`);
  if (b.description) parts.push(`Description: ${b.description}`);
  if (b.content) parts.push(`Content: ${b.content}`);
  return parts.join("\n");
}

// ── Build fixtures from snapshots ───────────────────────────────────────

function buildSnapshotFixtures(): EvalFixture[] {
  const bookmarks = loadSnapshotBookmarks();
  if (bookmarks.length === 0) {
    return [];
  }

  const basicFixtures: EvalFixture[] = bookmarks.map((b, i) => ({
    id: `snapshot-${i}-${slugify(b.title || b.id)}`,
    description: `Real bookmark: ${b.title || b.url || b.id}`,
    content: bookmarkToContent(b),
    lang: "english",
    tagStyle: "as-generated" as const,
    customPrompts: [],

    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  }));

  return basicFixtures;
}

// ── Truncation fixtures ─────────────────────────────────────────────────

function buildTruncationFixtures(): EvalFixture[] {
  const bookmarks = loadSnapshotBookmarks();
  // Pick bookmarks with substantial content for truncation testing
  const longBookmarks = bookmarks.filter(
    (b) => (b.content?.length ?? 0) > 2000,
  );

  if (longBookmarks.length === 0) {
    return [];
  }

  const fixtures: EvalFixture[] = [];
  // Test up to 3 long bookmarks at various context lengths
  const testBookmarks = longBookmarks.slice(0, 3);
  const contextLengths = [512, 1024, 2048];

  for (const b of testBookmarks) {
    const content = bookmarkToContent(b);
    const slug = slugify(b.title || b.id);

    for (const ctxLen of contextLengths) {
      fixtures.push({
        id: `truncation-${ctxLen}-${slug}`,
        description: `Truncation at ${ctxLen} tokens: ${b.title || b.url || b.id}`,
        content,
        lang: "english",
        tagStyle: "as-generated",
        customPrompts: [],
    
        expectEmpty: false,
        contextLength: ctxLen,
        minTags: 1,
        maxTags: 10,
      });
    }
  }

  return fixtures;
}

// ── Synthetic fixtures ──────────────────────────────────────────────────

const syntheticFixtures: EvalFixture[] = [
  {
    id: "reject-403-forbidden",
    description: "403 Forbidden page should produce empty tags",
    content: `
      403 Forbidden
      You don't have permission to access this resource.
      Please contact the server administrator if you think this is an error.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectEmpty: true,
  },
  {
    id: "reject-503-unavailable",
    description: "503 Service Unavailable page should produce empty tags",
    content: `
      503 Service Unavailable
      The server is temporarily unable to handle the request. Please try again later.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectEmpty: true,
  },
  {
    id: "reject-404-not-found",
    description: "404 Not Found page should produce empty tags",
    content: `
      404 Not Found
      The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
      Please check the URL or go back to the homepage.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectEmpty: true,
  },
  {
    id: "reject-401-unauthorized",
    description: "401 Unauthorized page should produce empty tags",
    content: `
      401 Unauthorized
      Authentication is required to access this resource. Please log in and try again.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectEmpty: true,
  },
  {
    id: "reject-cloudflare-challenge",
    description: "Cloudflare challenge page should produce empty tags",
    content: `
      Attention Required! | Cloudflare
      Please complete the security check to access the website.
      Ray ID: 7a8b9c0d1e2f3a4b
      Performance & security by Cloudflare
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectEmpty: true,
  },
  {
    id: "reject-empty-content",
    description: "Empty content should produce empty tags",
    content: "",
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectEmpty: true,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// ── Exported dataset ────────────────────────────────────────────────────

export const dataset: EvalFixture[] = [
  ...buildSnapshotFixtures(),
  ...buildTruncationFixtures(),
  ...syntheticFixtures,
];
