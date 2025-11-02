/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globalSetup: ["./src/tests/setup/startContainers.ts"],
    teardownTimeout: 30000,
    include: ["src/tests/**/*.test.ts"],
    testTimeout: 60000,
  },
});
