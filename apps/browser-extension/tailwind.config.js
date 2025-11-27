import web from "@karakeep/tailwind-config/web";

const config = {
  darkMode: "selector",
  content: [
    ...web.content,
    // Include the shared UI package
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  presets: [web],
};

export default config;
