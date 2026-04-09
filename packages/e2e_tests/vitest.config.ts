/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths({ skip: (dir) => dir === ".claude" })],
  test: {
    alias: {
      "@/*": "./*",
    },
    globalSetup: ["./setup/startContainers.ts", "./setup/seed.ts"],
    teardownTimeout: 30000,
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    env: {
      NEXTAUTH_SECRET: "secret",
    },
  },
});
