// This file is shamelessly copied from immich's CLI vite config
// https://github.com/immich-app/immich/blob/main/cli/vite.config.ts
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const skillContent = readFileSync(
  new URL("../../skills/SKILL.md", import.meta.url),
  "utf8",
);

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
      external: ["node:fs", "node:os", "node:path", "node:url", "node:process"],
    },
    ssr: true,
    target: "node18",
  },
  ssr: {
    // bundle everything except for Node built-ins
    noExternal: /^(?!node:).*$/,
  },
  plugins: [tsconfigPaths({ skip: (dir) => dir === ".claude" })],
  define: {
    __KARAKEEP_SKILL_CONTENT__: JSON.stringify(skillContent),
    "import.meta.env.CLI_VERSION": JSON.stringify(
      process.env.npm_package_version,
    ),
  },
  esbuild: {
    // Handle shebang in source files
    banner: "",
  },
});
