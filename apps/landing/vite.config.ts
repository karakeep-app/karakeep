import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  plugins: [react(), svgr()],
});
