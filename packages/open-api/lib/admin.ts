import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import * as z from "zod";

import { updateUserSchema } from "@karakeep/shared/types/admin";

import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";

export const registry = new OpenAPIRegistry();

const updateUserRequestSchema = updateUserSchema.omit({ userId: true });

const updateUserResponseSchema = z.object({
  success: z.boolean().describe("Whether the update was successful."),
});

const adminJobSuccessResponseSchema = z.object({
  success: z.boolean().describe("Whether the job was triggered successfully."),
});

const adminForbiddenResponse = {
  description: "Forbidden — admin access required.",
  content: {
    "application/json": {
      schema: ErrorSchema,
    },
  },
};

registry.registerPath({
  operationId: "adminUpdateUser",
  method: "put",
  path: "/admin/users/{userId}",
  description:
    "Update a user's role, bookmark quota, storage quota, or browser crawling setting. " +
    "Requires admin role. You cannot update your own user account via this endpoint.",
  summary: "Update a user (admin)",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({
      userId: z.string().openapi({
        description: "The ID of the user to update.",
        example: "user_123",
      }),
    }),
    body: {
      description:
        "The fields to update. All fields are optional — only provided fields will be changed.",
      content: {
        "application/json": {
          schema: updateUserRequestSchema.openapi({
            description: "User update data",
            example: {
              role: "admin",
              bookmarkQuota: 1000,
              storageQuota: 5000000000,
            },
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "User updated successfully.",
      content: {
        "application/json": {
          schema: updateUserResponseSchema,
        },
      },
    },
    400: {
      description:
        "Bad request — invalid input data or attempted to update own user.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    403: adminForbiddenResponse,
    404: {
      description: "User not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "adminTriggerRecrawl",
  method: "post",
  path: "/admin/jobs/trigger/recrawl",
  description:
    "Trigger a recrawl of link bookmarks. You can filter by crawl status to target specific bookmarks " +
    "(e.g., only failed ones). Optionally run AI inference after crawling. Requires admin role.",
  summary: "Trigger recrawl of links (admin)",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "Options for the recrawl job.",
      content: {
        "application/json": {
          schema: z
            .object({
              crawlStatus: z
                .enum(["success", "failure", "pending", "all"])
                .default("all")
                .describe(
                  "Filter bookmarks by their crawl status. Use 'failure' to retry only failed crawls.",
                ),
              runInference: z
                .boolean()
                .default(false)
                .describe("Whether to run AI inference after crawling."),
            })
            .openapi({
              example: {
                crawlStatus: "failure",
                runInference: false,
              },
            }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Recrawl jobs triggered successfully.",
      content: {
        "application/json": {
          schema: adminJobSuccessResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request — invalid input data.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    403: adminForbiddenResponse,
  },
});

registry.registerPath({
  operationId: "adminTriggerReindex",
  method: "post",
  path: "/admin/jobs/trigger/reindex",
  description:
    "Trigger a reindex of all bookmarks in the search engine. This clears the existing index and " +
    "re-queues all bookmarks for indexing. Requires admin role.",
  summary: "Trigger reindex of all bookmarks (admin)",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  responses: {
    200: {
      description: "Reindex jobs triggered successfully.",
      content: {
        "application/json": {
          schema: adminJobSuccessResponseSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    403: adminForbiddenResponse,
  },
});

registry.registerPath({
  operationId: "adminTriggerInference",
  method: "post",
  path: "/admin/jobs/trigger/inference",
  description:
    "Trigger AI inference (tagging or summarization) on bookmarks. You can filter by status " +
    "to target specific bookmarks (e.g., only failed ones). Requires admin role.",
  summary: "Trigger AI inference on bookmarks (admin)",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "Options for the inference job.",
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              type: z
                .enum(["tag", "summarize"])
                .describe(
                  "The type of inference to run: 'tag' for AI tagging, 'summarize' for AI summarization.",
                ),
              status: z
                .enum(["success", "failure", "pending", "all"])
                .default("all")
                .describe(
                  "Filter bookmarks by their inference status. Use 'failure' to retry only failed ones.",
                ),
            })
            .openapi({
              example: {
                type: "tag",
                status: "failure",
              },
            }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Inference jobs triggered successfully.",
      content: {
        "application/json": {
          schema: adminJobSuccessResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request — invalid input data.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    403: adminForbiddenResponse,
  },
});
