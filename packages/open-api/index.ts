import * as fs from "fs";
import * as process from "process";
import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";

import { registry as adminRegistry } from "./lib/admin";
import { registry as assetsRegistry } from "./lib/assets";
import { registry as backupsRegistry } from "./lib/backups";
import { registry as bookmarksRegistry } from "./lib/bookmarks";
import { registry as commonRegistry } from "./lib/common";
import { registry as highlightsRegistry } from "./lib/highlights";
import { registry as listsRegistry } from "./lib/lists";
import { registry as tagsRegistry } from "./lib/tags";
import { registry as userRegistry } from "./lib/users";

function getOpenApiDocumentation() {
  const registry = new OpenAPIRegistry([
    commonRegistry,
    bookmarksRegistry,
    listsRegistry,
    tagsRegistry,
    highlightsRegistry,
    userRegistry,
    assetsRegistry,
    adminRegistry,
    backupsRegistry,
  ]);

  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Karakeep API",
      description:
        "Karakeep is a self-hostable bookmarking and read-it-later service. " +
        "This API allows you to manage bookmarks, lists, tags, highlights, assets, and backups programmatically.\n\n" +
        "## Authentication\n\n" +
        "All endpoints require a Bearer token passed in the `Authorization` header. " +
        "You can generate an API key from the Karakeep web UI under **Settings > API Keys**.\n\n" +
        "## Pagination\n\n" +
        "List endpoints support cursor-based pagination via `cursor` and `limit` query parameters. " +
        "The response includes a `nextCursor` field — pass it as the `cursor` parameter to fetch the next page. " +
        "A `null` value for `nextCursor` indicates there are no more results.\n\n" +
        "## Bookmark Types\n\n" +
        "Bookmarks can be one of three types:\n" +
        "- **link** — A URL bookmark with optional crawled metadata.\n" +
        "- **text** — A plain text note.\n" +
        "- **asset** — An uploaded file (image or PDF).",
    },
    tags: [
      {
        name: "Bookmarks",
        description:
          "Manage bookmarks — create, retrieve, update, delete, search, and organize bookmarks with tags, lists, highlights, and assets.",
      },
      {
        name: "Lists",
        description:
          "Manage bookmark lists. Lists can be manual (curated) or smart (query-based). Bookmarks can belong to multiple lists.",
      },
      {
        name: "Tags",
        description:
          "Manage tags for categorizing bookmarks. Tags can be attached by users or automatically by AI.",
      },
      {
        name: "Highlights",
        description:
          "Manage text highlights within bookmarks. Highlights support color coding and optional notes.",
      },
      {
        name: "Assets",
        description:
          "Upload and retrieve binary assets (images, PDFs, screenshots) associated with bookmarks.",
      },
      {
        name: "Users",
        description:
          "Retrieve information and statistics about the currently authenticated user.",
      },
      {
        name: "Admin",
        description:
          "Administrative endpoints for managing users. Requires admin role.",
      },
      {
        name: "Backups",
        description:
          "Create and manage full account backups as downloadable zip archives.",
      },
    ],
    servers: [
      {
        url: "{address}/api/v1",
        variables: {
          address: {
            default: "https://try.karakeep.app",
            description: "The address of the Karakeep server",
          },
        },
      },
    ],
  });
}

function writeDocumentation() {
  const docs = getOpenApiDocumentation();
  const fileContent = JSON.stringify(docs, null, 2);
  fs.writeFileSync(`./karakeep-openapi-spec.json`, fileContent, {
    encoding: "utf-8",
  });
}

function checkDocumentation() {
  const docs = getOpenApiDocumentation();
  const fileContent = JSON.stringify(docs, null, 2);
  const oldContent = fs.readFileSync(`./karakeep-openapi-spec.json`, {
    encoding: "utf-8",
  });
  if (oldContent !== fileContent) {
    process.exit(1);
  }
}

if (process.argv[2] === "check") {
  checkDocumentation();
} else {
  writeDocumentation();
}
