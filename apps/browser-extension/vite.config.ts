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
      contentScripts: {
        // Injected on demand with `chrome.scripting.executeScript({ files })`,
        // which needs a self-contained classic script rather than crxjs's
        // default loader (it imports the real module asynchronously).
        standaloneFiles: ["src/content-scripts/singlefile-content-script.ts"],
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
