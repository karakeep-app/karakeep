import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { updateUserSchema } from "@karakeep/shared/types/admin";

import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

const updateUserRequestSchema = updateUserSchema.omit({ userId: true });

const updateUserResponseSchema = z.object({
  success: z.boolean().describe("Whether the update was successful."),
});

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
    403: {
      description: "Forbidden — admin access required.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
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
