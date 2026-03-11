import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
  zUserStatsResponseSchema,
  zWhoAmIResponseSchema,
} from "@karakeep/shared/types/users";

import { BearerAuth } from "./common";
import { UnauthorizedResponse } from "./errors";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

registry.registerPath({
  operationId: "getCurrentUser",
  method: "get",
  path: "/users/me",
  description:
    "Retrieve profile information for the currently authenticated user, including their name, email, and avatar.",
  summary: "Get current user info",
  tags: ["Users"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "The current user's profile information.",
      content: {
        "application/json": {
          schema: zWhoAmIResponseSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "getCurrentUserStats",
  method: "get",
  path: "/users/me/stats",
  description:
    "Retrieve usage statistics for the currently authenticated user, including bookmark counts by type, " +
    "top domains, tag usage, bookmarking activity patterns, and storage usage.",
  summary: "Get current user stats",
  tags: ["Users"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Detailed usage statistics for the current user.",
      content: {
        "application/json": {
          schema: zUserStatsResponseSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});
