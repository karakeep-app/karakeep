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
      description: "The API for the Karakeep app",
    },
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
