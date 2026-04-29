import * as fs from "fs";
import matter from "gray-matter";
import * as path from "path";

import type { ZTagStyle } from "@karakeep/shared/types/users";

export interface EvalFixture {
  id: string;
  category: string;
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
}

// ── Shared loader ───────────────────────────────────────────────────────

interface FixtureFrontmatter {
  id: string;
  title?: string;
  url?: string;
  description?: string;
  expectEmpty?: boolean;
  minTags?: number;
  maxTags?: number;
}

function loadFixturesFromDir(dir: string, category: string): EvalFixture[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    return [];
  }

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    const { data, content } = matter(raw);
    const fm = data as FixtureFrontmatter;

    const parts: string[] = [];
    if (fm.url) parts.push(`URL: ${fm.url}`);
    if (fm.title) parts.push(`Title: ${fm.title}`);
    if (fm.description && !fm.expectEmpty)
      parts.push(`Description: ${fm.description}`);
    if (content.trim()) parts.push(`Content: ${content.trim()}`);

    return {
      id: fm.id || slugify(file),
      category,
      description: fm.description || fm.title || file,
      content: parts.join("\n"),
      lang: "english",
      tagStyle: "as-generated" as const,
      customPrompts: [],
      expectEmpty: fm.expectEmpty ?? false,
      minTags: fm.minTags ?? (fm.expectEmpty ? undefined : 3),
      maxTags: fm.maxTags ?? (fm.expectEmpty ? undefined : 5),
    };
  });
}

// ── Load all fixture categories ─────────────────────────────────────────

function loadAllFixtures(): EvalFixture[] {
  const fixturesRoot = path.join(__dirname, "..", "fixtures");
  if (!fs.existsSync(fixturesRoot)) {
    return [];
  }

  const entries = fs.readdirSync(fixturesRoot, { withFileTypes: true });
  const fixtures: EvalFixture[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const category = entry.name;
    const dir = path.join(fixturesRoot, category);
    fixtures.push(...loadFixturesFromDir(dir, category));
  }

  return fixtures;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// ── Exported dataset ────────────────────────────────────────────────────

export const dataset: EvalFixture[] = loadAllFixtures();
