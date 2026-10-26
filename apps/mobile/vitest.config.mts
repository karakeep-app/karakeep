/// <reference types="vitest" />

import { defineConfig } from "vitest/config";

// Only the platform-independent logic is unit tested; native modules are
// mocked per test file.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
  },
});
