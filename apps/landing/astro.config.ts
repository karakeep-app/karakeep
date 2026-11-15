import { copyFile } from "node:fs/promises";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import { BASE_URL } from "./src/constants";

export default defineConfig({
  site: BASE_URL,
  trailingSlash: "always",
  // Keep HTML whitespace handling from Astro 6.
  compressHTML: true,
  integrations: [
    react(),
    sitemap(),
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
