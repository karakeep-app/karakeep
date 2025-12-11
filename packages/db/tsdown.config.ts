import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["migrate.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  minify: false,
  sourcemap: true,
  platform: "node",
  shims: true,
  external: [
    // Keep native binaries and their dependencies external
    "@libsql/client",
    "libsql",
  ],
  noExternal: [
    // Bundle workspace packages (since they're not published to npm)
    /^@karakeep\//,
  ],
});
