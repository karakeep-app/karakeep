/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Several worker modules import local helpers (e.g. "metrics", "workerTracing")
// as bare specifiers resolved via tsconfig's `baseUrl`. Vite doesn't honor that
// on its own, so tests that import such a module (directly or transitively)
// need this plugin to resolve them the same way `tsc`/the build already do.
export default defineConfig({
  plugins: [tsconfigPaths()],
});
