import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  build: {
    lib: {
      entry: "index.ts",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "mjs" : "js"}`,
    },
    rollupOptions: {
      // Mark all dependencies as external to avoid bundling them
      external: [
        "@karakeep/db",
        "@karakeep/plugins",
        "@karakeep/shared",
        "@karakeep/shared-server",
        "@trpc/server",
        "bcryptjs",
        "deep-equal",
        "drizzle-orm",
        "nodemailer",
        "prom-client",
        "stripe",
        "superjson",
        "tiny-invariant",
        "zod",
      ],
    },
    ssr: true,
    sourcemap: true,
  },
  plugins: [tsconfigPaths(), dts({ rollupTypes: true, copyDtsFiles: true })],
});
