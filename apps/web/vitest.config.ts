/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  // Next preserves JSX; component tests need an automatic-runtime JSX transform.
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [tsconfigPaths({ skip: (dir) => dir === ".claude" })],
  test: {
    alias: {
      "@/*": "./*",
    },
  },
});
