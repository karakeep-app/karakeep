import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { updateUserSchema } from "@karakeep/shared/types/admin";

import { BearerAuth } from "./common";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

const updateUserRequestSchema = updateUserSchema.omit({ userId: true });

const updateUserResponseSchema = z.object({
  success: z.boolean(),
});

registry.registerPath({
  method: "put",
  path: "/admin/users/{userId}",
  description:
    "Update a user's role, bookmark quota, or storage quota. Admin access required.",
  summary: "Update user",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({
      userId: z.string().openapi({
        description: "The ID of the user to update",
        example: "user_123",
      }),
    }),
    body: {
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
      description: "User updated successfully",
      content: {
        "application/json": {
          schema: updateUserResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request - Invalid input data or cannot update own user",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: "Unauthorized - Authentication required",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    403: {
      description: "Forbidden - Admin access required",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});
