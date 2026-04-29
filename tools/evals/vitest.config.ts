import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
  esbuild: {
    // Skip tsconfig resolution for external packages
    tsconfigRaw: "{}",
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 30_000,
    include: ["src/**/*.eval.ts"],
    passWithNoTests: true,
  },
});
