import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

import manifest from "./manifest.json";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    crx({
      manifest,
      browser: process.env.VITE_BUILD_FIREFOX ? "firefox" : "chrome",
    }),
  ],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
