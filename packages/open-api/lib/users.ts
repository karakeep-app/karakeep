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

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

registry.registerPath({
  method: "get",
  path: "/users/me",
  description: "Returns info about the current user",
  summary: "Get current user info",
  tags: ["Users"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Object with user data.",
      content: {
        "application/json": {
          schema: zWhoAmIResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/users/me/stats",
  description: "Returns stats about the current user",
  summary: "Get current user stats",
  tags: ["Users"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Object with user stats.",
      content: {
        "application/json": {
          schema: zUserStatsResponseSchema,
        },
      },
    },
  },
});
