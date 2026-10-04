import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import { BASE_URL } from "./src/constants";

export default defineConfig({
  site: BASE_URL,
  trailingSlash: "always",
  // Keep HTML whitespace handling from Astro 6.
  compressHTML: true,
  integrations: [react(), sitemap()],
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
