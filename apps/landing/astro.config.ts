import { readFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { satteri } from "@astrojs/markdown-satteri";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import { releaseNotePlugins } from "./src/blog/markdown-plugins";
import { BASE_URL } from "./src/constants";

// Built output, read by the sitemap filter below. Matches Astro's default outDir.
const outDir = new URL("./dist/", import.meta.url);

/**
 * Pages opt out of search results with `noindex: true` in their frontmatter,
 * which renders a `noindex` robots tag. The sitemap runs after the pages are
 * written, so read that tag back instead of keeping a second list here.
 */
function isNoindexPage(page: string) {
  const { pathname } = new URL(page);
  const file = new URL(
    `.${pathname}${pathname.endsWith("/") ? "index.html" : ""}`,
    outDir,
  );
  try {
    return /<meta name="robots" content="noindex/.test(
      readFileSync(file, "utf8"),
    );
  } catch {
    return false;
  }
}

export default defineConfig({
  site: BASE_URL,
  trailingSlash: "always",
  // Keep HTML whitespace handling from Astro 6.
  compressHTML: true,
  markdown: {
    processor: satteri({ mdastPlugins: [releaseNotePlugins] }),
  },
  integrations: [
    react(),
    sitemap({ filter: (page) => !isNoindexPage(page) }),
    {
      // @astrojs/sitemap only emits sitemap-index.xml, but crawlers and tools
      // commonly probe /sitemap.xml, which our host otherwise answers with the
      // homepage. Serve a copy of the index there too.
      name: "sitemap-xml-alias",
      hooks: {
        "astro:build:done": async ({ dir }) => {
          await copyFile(
            new URL("sitemap-index.xml", dir),
            new URL("sitemap.xml", dir),
          );
        },
      },
    },
  ],
  vite: {
    plugins: [(await import("vite-plugin-svgr")).default()],
    environments: {
      prerender: {
        // Bundle Astro's cookie version instead of resolving the workspace's older copy.
        resolve: { noExternal: ["cookie"] },
      },
    },
  },
});
