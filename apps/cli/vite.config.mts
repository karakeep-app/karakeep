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
        format: "es",
        entryFileNames: "index.mjs",
        banner: "#!/usr/bin/env node",
      },
      external: ["node:fs", "node:path", "node:url", "node:process"],
    },
    ssr: true,
    target: "node18",
  },
  ssr: {
    // bundle everything except for Node built-ins
    noExternal: /^(?!node:).*$/,
  },
  plugins: [tsconfigPaths()],
  define: {
    "import.meta.env.CLI_VERSION": JSON.stringify(
      process.env.npm_package_version,
    ),
  },
  esbuild: {
    // Handle shebang in source files
    banner: "",
  },
});
