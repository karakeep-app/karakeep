import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Long-form posts (guides, comparisons, announcements) written for the blog.
 * Add a markdown file to `src/content/blog/`; its filename becomes the URL
 * (`/blog/<filename>/`).
 */
const blog = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // Used as the meta description and in link previews, so keep it under
      // ~160 characters.
      description: z.string().max(200),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      author: z.string().default("The Karakeep Team"),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      tags: z.array(z.string()).default([]),
      // Drafts only show up in `astro dev`.
      draft: z.boolean().default(false),
      // Keep the page live but out of search results and the sitemap.
      noindex: z.boolean().default(false),
    }),
});

/**
 * The release notes committed to the repo root on every release, published at
 * `/blog/releases/v<version>/`. Each one starts with frontmatter like:
 *
 *   ---
 *   title: "Karakeep 0.35.0"
 *   version: "0.35.0"
 *   date: 2026-11-15
 *   description: "One or two sentences for search results and link previews."
 *   noindex: true # for hotfixes and other thin notes
 *   draft: true # don't publish this note at all (still shown in dev)
 *   ---
 *
 * Paste only the part after the frontmatter into the GitHub release.
 */
const releases = defineCollection({
  loader: glob({ pattern: "*.md", base: "../../release-notes" }),
  schema: z.object({
    title: z.string(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "Use X.Y.Z, without the v"),
    date: z.coerce.date(),
    description: z.string().max(200),
    noindex: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, releases };
