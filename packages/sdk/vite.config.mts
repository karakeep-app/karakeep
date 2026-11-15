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
      // Ship a single ESM bundle at dist/index.js (the package is
      // `"type": "module"`). CommonJS consumers load it through Node's
      // require(esm) support. A CJS bundle isn't emitted because Rolldown's
      // Node-mode interop turns openapi-fetch's default export into its
      // module namespace object in that format.
      output: [{ format: "es", entryFileNames: "index.js" }],
    },
    ssr: true,
    sourcemap: true,
  },
  // Type declarations are emitted by tsc (see the build script).
  plugins: [tsconfigPaths({ skip: (dir) => dir === ".claude" })],
});
