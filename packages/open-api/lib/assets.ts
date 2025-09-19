import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { BearerAuth } from "./common";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

export const AssetIdSchema = registry.registerParameter(
  "AssetId",
  z.string().openapi({
    param: {
      name: "assetId",
      in: "path",
    },
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  method: "post",
  path: "/assets",
  description: "Upload a new asset",
  summary: "Upload a new asset",
  tags: ["Assets"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "The data to create the asset with.",
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.instanceof(File).openapi("File to be uploaded"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Details about the created asset",
      content: {
        "application/json": {
          schema: z
            .object({
              assetId: z.string(),
              contentType: z.string(),
              size: z.number(),
              fileName: z.string(),
            })
            .openapi("Asset"),
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/assets/{assetId}",
  description: "Get asset by its id",
  summary: "Get a single asset",
  tags: ["Assets"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ assetId: AssetIdSchema }),
  },
  responses: {
    200: {
      description:
        "Asset content. Content type is determined by the asset type.",
    },
  },
});
