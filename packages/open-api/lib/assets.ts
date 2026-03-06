import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { BearerAuth } from "./common";
import { UnauthorizedResponse } from "./errors";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

export const AssetIdSchema = registry.registerParameter(
  "AssetId",
  z.string().openapi({
    param: {
      name: "assetId",
      in: "path",
    },
    description: "The unique identifier of the asset.",
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  operationId: "uploadAsset",
  method: "post",
  path: "/assets",
  description:
    "Upload a binary file as a new asset. The uploaded asset can then be attached to a bookmark via the POST /bookmarks/{bookmarkId}/assets endpoint.",
  summary: "Upload a new asset",
  tags: ["Assets"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "The file to upload as multipart/form-data.",
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
      description:
        "The asset was uploaded successfully. Returns metadata about the uploaded asset.",
      content: {
        "application/json": {
          schema: z
            .object({
              assetId: z
                .string()
                .describe(
                  "The unique identifier assigned to the uploaded asset.",
                ),
              contentType: z
                .string()
                .describe("The MIME type of the uploaded file."),
              size: z
                .number()
                .describe("The size of the uploaded file in bytes."),
              fileName: z
                .string()
                .describe("The original file name of the uploaded file."),
            })
            .openapi("UploadedAsset"),
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "getAsset",
  method: "get",
  path: "/assets/{assetId}",
  description:
    "Download an asset's binary content. The response Content-Type header is set based on the asset's MIME type.",
  summary: "Get a single asset",
  tags: ["Assets"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ assetId: AssetIdSchema }),
  },
  responses: {
    200: {
      description:
        "The asset's binary content. The Content-Type header reflects the asset's MIME type (e.g., image/png, application/pdf).",
    },
    401: UnauthorizedResponse,
  },
});
