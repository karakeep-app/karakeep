import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import { BASE_URL } from "./src/constants";

export default defineConfig({
  site: BASE_URL,
  trailingSlash: "always",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [(await import("vite-plugin-svgr")).default()],
  },
});
