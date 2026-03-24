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
  /** Broad topics the tags should relate to (used by LLM judge) */
  expectedTopics: string[];
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

function bookmarkExpectedTopics(b: SnapshotBookmark): string[] {
  // Use existing AI + human tags as the expected topics baseline
  return [...new Set([...b.existingAiTags, ...b.existingHumanTags])];
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
    expectedTopics: bookmarkExpectedTopics(b),
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
    const expectedTopics = bookmarkExpectedTopics(b);
    const slug = slugify(b.title || b.id);

    for (const ctxLen of contextLengths) {
      fixtures.push({
        id: `truncation-${ctxLen}-${slug}`,
        description: `Truncation at ${ctxLen} tokens: ${b.title || b.url || b.id}`,
        content,
        lang: "english",
        tagStyle: "as-generated",
        customPrompts: [],
        expectedTopics,
        expectEmpty: false,
        contextLength: ctxLen,
        minTags: 1,
        maxTags: 10,
      });
    }
  }

  return fixtures;
}

// ── Synthetic fixtures (style, curated, language, edge cases) ───────────

const syntheticFixtures: EvalFixture[] = [
  // ── Tag style compliance ──────────────────────────────────────────────
  {
    id: "style-lowercase-hyphens",
    description: "Tags should use lowercase-hyphens style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "lowercase-hyphens",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-lowercase-spaces",
    description: "Tags should use lowercase-spaces style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "lowercase-spaces",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-lowercase-underscores",
    description: "Tags should use lowercase-underscores style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "lowercase-underscores",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-titlecase-spaces",
    description: "Tags should use titlecase-spaces style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "titlecase-spaces",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-titlecase-hyphens",
    description: "Tags should use titlecase-hyphens style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "titlecase-hyphens",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-camelcase",
    description: "Tags should use camelCase style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "camelCase",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },

  // ── Curated tags constraint ───────────────────────────────────────────
  {
    id: "curated-matching",
    description: "Tags should only come from the curated list",
    content: `
      Title: How React Server Components Change Web Development
      Content: React Server Components allow rendering components on the server, reducing client-side JavaScript
      bundle sizes. Combined with Next.js App Router, they enable streaming HTML and progressive enhancement.
      Data fetching happens directly in components without useEffect or client-side state management.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    curatedTags: [
      "react",
      "javascript",
      "web-development",
      "frontend",
      "backend",
      "devops",
      "databases",
      "mobile",
      "security",
      "cloud",
    ],
    expectedTopics: ["react", "javascript", "web-development", "frontend"],
    expectEmpty: false,
    minTags: 1,
    maxTags: 5,
  },
  {
    id: "curated-no-match",
    description: "Should produce empty tags when no curated tags fit",
    content: `
      Title: How React Server Components Change Web Development
      Content: React Server Components allow rendering components on the server, reducing client-side JavaScript
      bundle sizes. Combined with Next.js App Router, they enable streaming HTML and progressive enhancement.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    curatedTags: [
      "gardening",
      "pottery",
      "knitting",
      "woodworking",
      "ceramics",
    ],
    expectedTopics: [],
    expectEmpty: true,
  },

  // ── Language compliance ───────────────────────────────────────────────
  {
    id: "lang-french",
    description: "Tags should be in French",
    content: `
      Title: The Future of Electric Vehicles
      Content: Electric vehicles are rapidly transforming the automotive industry. Battery technology improvements
      have extended range beyond 300 miles. Charging infrastructure is expanding globally. Major automakers
      plan to phase out internal combustion engines by 2035.
    `,
    lang: "french",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [
      "electric vehicles",
      "automotive",
      "technology",
      "environment",
    ],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "lang-spanish",
    description: "Tags should be in Spanish",
    content: `
      Title: The Future of Electric Vehicles
      Content: Electric vehicles are rapidly transforming the automotive industry. Battery technology improvements
      have extended range beyond 300 miles. Charging infrastructure is expanding globally. Major automakers
      plan to phase out internal combustion engines by 2035.
    `,
    lang: "spanish",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [
      "electric vehicles",
      "automotive",
      "technology",
      "environment",
    ],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },

  // ── Edge cases ────────────────────────────────────────────────────────
  {
    id: "edge-error-page",
    description: "404 error page content should produce empty tags",
    content: `
      404 Not Found
      The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
      Please check the URL or go back to the homepage.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [],
    expectEmpty: true,
  },
  {
    id: "edge-short-content",
    description: "Very short content should still produce some tags",
    content: `
      Title: Rust Programming Language
      Content: Rust is a systems programming language focused on safety and performance.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: ["Rust", "programming", "systems programming"],
    expectEmpty: false,
    minTags: 1,
    maxTags: 5,
  },
  {
    id: "edge-empty-content",
    description: "Empty content should produce empty or minimal tags",
    content: "",
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [],
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
