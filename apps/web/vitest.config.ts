/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    alias: {
      "@/*": "./*",
    },
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Optional: set a stable origin for APIs relying on URL
    // environmentOptions: { jsdom: { url: "http://localhost" } },
  },
});
