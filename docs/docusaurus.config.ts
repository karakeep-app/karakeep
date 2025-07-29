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

  onBrokenLinks: "throw",
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
              (item) => !(item.type == "category" && item.label === "API"),
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
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Introduction",
              to: "/",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/karakeep-app/karakeep",
            },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "Homepage",
              href: "https://karakeep.app",
            },
            {
              label: "GitHub",
              href: "https://github.com/karakeep-app/karakeep",
            },
            {
              label: "Demo",
              href: "https://try.karakeep.app",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Karakeep App. Built with Docusaurus.`,
    },
    algolia: {
      appId: 'V93C1M14G6',
      // Public API key: it is safe to commit it
      apiKey: '0eb8853d9740822fb9d21620d5515f35',
      indexName: 'karakeep',
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
