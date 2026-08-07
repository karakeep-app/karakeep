import type { Config } from "tailwindcss";

import web from "@karakeep/tailwind-config/web";

const config = {
  content: [
    ...web.content,
    "../../packages/shared-react/components/**/*.{ts,tsx}",
    "../../node_modules/streamdown/dist/*.js",
    "../../node_modules/@streamdown/cjk/dist/*.js",
    "../../node_modules/@streamdown/code/dist/*.js",
    "../../node_modules/@streamdown/math/dist/*.js",
    "../../node_modules/@streamdown/mermaid/dist/*.js",
  ],
  presets: [web],
  theme: {
    extend: {
      colors: {
        // Tokens for the "1a dense list" dark fork. Only resolve inside a
        // `.k-dense` ancestor (see app/dashboard/dense-theme.css) — additive
        // and inert everywhere else in the app.
        "k-bg": "var(--k-bg)",
        "k-surface-1": "var(--k-surface-1)",
        "k-surface-2": "var(--k-surface-2)",
        "k-border": "var(--k-border)",
        "k-border-soft": "var(--k-border-soft)",
        "k-accent": "var(--k-accent)",
        "k-accent-border": "var(--k-accent-border)",
        "k-accent-fg": "var(--k-accent-fg)",
        "k-fg": "var(--k-fg)",
        "k-fg-soft": "var(--k-fg-soft)",
        "k-fg-muted": "var(--k-fg-muted)",
        "k-fg-dim": "var(--k-fg-dim)",
        "k-timestamp": "var(--k-timestamp)",
        "k-version": "var(--k-version)",
        "k-version-rail": "var(--k-version-rail)",
        "k-skeleton": "var(--k-skeleton)",
        "k-divider": "var(--k-divider)",
      },
      fontFamily: {
        "k-sans": ["var(--font-k-sans)", "IBM Plex Sans", "sans-serif"],
        "k-mono": ["var(--font-k-mono)", "IBM Plex Mono", "monospace"],
      },
    },
  },
} satisfies Config;

export default config;
