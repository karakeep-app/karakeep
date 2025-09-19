// This file is shamelessly copied from immich's CLI vite config
// https://github.com/immich-app/immich/blob/main/cli/vite.config.ts
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  build: {
    rollupOptions: {
      input: "src/index.ts",
      output: {
        dir: "dist",
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    ssr: true,
  },
  ssr: {
    // bundle everything except for Node built-ins
    noExternal: /^(?!node:).*$/,
  },
  plugins: [tsconfigPaths()],
});
