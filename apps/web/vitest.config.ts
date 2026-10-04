/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  esbuild: { jsx: "automatic" },
  plugins: [tsconfigPaths({ skip: (dir) => dir === ".claude" })],
  test: {
    alias: {
      "@/*": "./*",
    },
  },
});
