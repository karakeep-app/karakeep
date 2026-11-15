// This file is shamelessly copied from immich's CLI vite config
// https://github.com/immich-app/immich/blob/main/cli/vite.config.ts
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
    },
    rolldownOptions: {
      external: ["openapi-fetch"],
      // Preserve the published entry points in Vite 8's SSR build.
      output: [
        { format: "es", entryFileNames: "index.mjs" },
        { format: "cjs", entryFileNames: "index.js" },
      ],
    },
    ssr: true,
    sourcemap: true,
  },
  // Type declarations are emitted by tsc (see the build script).
  plugins: [tsconfigPaths({ skip: (dir) => dir === ".claude" })],
});
