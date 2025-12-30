import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import type * as OpenApiPlugin from "docusaurus-plugin-openapi-docs";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "Karakeep Docs",
  tagline: "Dinosaurs are cool",
  favicon: "img/favicon.ico",

  // Set the production url of your site here
  url: "https://docs.karakeep.app",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "karakeep-app", // Usually your GitHub org/user name.
  projectName: "karakeep", // Usually your repo name.

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          sidebarItemsGenerator: async ({
            defaultSidebarItemsGenerator,
            ...args
          }) => {
            const sidebarItems = await defaultSidebarItemsGenerator(args);
            return sidebarItems.filter(
              (item) => !(item.type == "category" && item.label === "🔗 API"),
            );
          },
          editUrl: "https://github.com/karakeep-app/karakeep/tree/main/docs/",
          routeBasePath: "/",
          docItemComponent: "@theme/ApiItem",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      {
      //   redirects: [
      //     {
      //       to: "/getting-started/intro",
      //       from: "/intro",
      //     },
      //     {
      //       to: "/getting-started/screenshots",
      //       from: "/screenshots",
      //     },
      //     {
      //       to: "/configuration/environment-variables",
      //       from: "/configuration",
      //     },
      //     {
      //       to: "/using-karakeep/quick-sharing",
      //       from: "/quick-sharing",
      //     },
      //     {
      //       to: "/using-karakeep/import",
      //       from: "/import",
      //     },
      //     {
      //       to: "/using-karakeep/search-query-language",
      //       from: "/guides/search-query-language",
      //     },
      //     {
      //       to: "/integrations/openai",
      //       from: "/openai",
      //     },
      //     {
      //       to: "/integrations/command-line",
      //       from: "/command-line",
      //     },
      //     {
      //       to: "/integrations/mcp",
      //       from: "/mcp",
      //     },
      //     {
      //       to: "/integrations/different-ai-providers",
      //       from: "/guides/different-ai-providers",
      //     },
      //     {
      //       to: "/integrations/singlefile",
      //       from: "/guides/singlefile",
      //     },
      //     {
      //       to: "/administration/security-considerations",
      //       from: "/security-considerations",
      //     },
      //     {
      //       to: "/administration/FAQ",
      //       from: "/FAQ",
      //     },
      //     {
      //       to: "/administration/troubleshooting",
      //       from: "/troubleshooting",
      //     },
      //     {
      //       to: "/administration/server-migration",
      //       from: "/guides/server-migration",
      //     },
      //     {
      //       to: "/administration/legacy-container-upgrade",
      //       from: "/guides/legacy-container-upgrade",
      //     },
      //     {
      //       to: "/administration/hoarder-to-karakeep-migration",
      //       from: "/guides/hoarder-to-karakeep-migration",
      //     },
      //     {
      //       to: "/community/community-projects",
      //       from: "/community-projects",
      //     },
      //   ],
      },
    ],
    [
      "docusaurus-plugin-openapi-docs",
      {
        id: "api",
        docsPluginId: "classic",
        config: {
          karakeep: {
            specPath: "../packages/open-api/karakeep-openapi-spec.json",
            outputDir: "docs/api",
            sidebarOptions: {
              groupPathsBy: "tag",
            },
          } satisfies OpenApiPlugin.Options,
        },
      },
    ],
  ],
  themes: ["docusaurus-theme-openapi-docs"],

  themeConfig: {
    image: "img/opengraph-image.png",
    navbar: {
      title: "",
      logo: {
        alt: "Karakeep Logo",
        src: "img/logo-full.svg",
        srcDark: "img/logo-full-white.svg",
        width: "120px",
      },
      items: [
        {
          type: "docsVersionDropdown",
          position: "right",
        },
        {
          href: "https://karakeep.app",
          label: "Homepage",
          position: "right",
        },
        {
          href: "https://github.com/karakeep-app/karakeep",
          label: "GitHub",
          position: "right",
        },
        {
          href: "https://discord.gg/NrgeYywsFh",
          label: "Discord",
          position: "right",
        },
      ],
    },

    algolia: {
      appId: "V93C1M14G6",
      // Public API key: it is safe to commit it
      apiKey: "0eb8853d9740822fb9d21620d5515f35",
      indexName: "karakeep",
      contextualSearch: true,
      insights: true,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
