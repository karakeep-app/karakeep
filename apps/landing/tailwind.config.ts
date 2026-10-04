import type { Config } from "tailwindcss";

import web from "@karakeep/tailwind-config/web";

const config = {
  content: [...(web.content as string[]), "src/**/*.astro"],
  presets: [web],
  theme: {
    extend: {
      fontFamily: {
        // Headline font (Bricolage Grotesque), defined by the --font-display
        // variable in BaseLayout.astro.
        display: "var(--font-display)",
      },
    },
  },
} satisfies Config;

export default config;
