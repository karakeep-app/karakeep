import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  minify: false,
  sourcemap: true,
  platform: "node",
  shims: true,
  external: [
    // Keep native binaries external (transitive deps of bundled workspace packages)
    "better-sqlite3",
    "liteque",
  ],
  noExternal: [
    // Bundle workspace packages (since they're not published to npm)
    /^@karakeep\//,
  ],
});
