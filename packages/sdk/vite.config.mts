// This file is shamelessly copied from immich's CLI vite config
// https://github.com/immich-app/immich/blob/main/cli/vite.config.ts
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "mjs" : "js"}`,
    },
    rollupOptions: {
      external: ["openapi-fetch"],
    },
    ssr: true,
    sourcemap: true,
  },
  plugins: [tsconfigPaths(), dts({ rollupTypes: true, copyDtsFiles: true })],
});
