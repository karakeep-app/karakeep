import type { Config } from "tailwindcss";

import web from "@karakeep/tailwind-config/web";

const config = {
  content: web.content,
  presets: [web],
} satisfies Config;

export default config;
