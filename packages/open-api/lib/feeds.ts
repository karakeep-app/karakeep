import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
  zFeedSchema,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

const FeedSchema = zFeedSchema
  .extend({
    lastFetchedAt: z.string().nullable().openapi({
      description:
        "ISO 8601 timestamp of the last fetch attempt, or null if never fetched.",
      example: "2025-01-15T12:00:00.000Z",
    }),
    lastSuccessfulFetchAt: z.string().nullable().openapi({
      description:
        "ISO 8601 timestamp of the last successful fetch, or null if the feed has never been fetched successfully.",
      example: "2025-01-15T12:00:00.000Z",
    }),
  })
  .openapi("Feed");

export const FeedIdSchema = registry.registerParameter(
  "FeedId",
  z.string().openapi({
    param: {
      name: "feedId",
      in: "path",
    },
    description: "The unique identifier of the feed.",
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  operationId: "listFeeds",
  method: "get",
  path: "/feeds",
  description:
    "Retrieve all RSS feed subscriptions for the authenticated user.",
  summary: "Get all feeds",
  tags: ["Feeds"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "A list of all feeds.",
      content: {
        "application/json": {
          schema: z.object({
            feeds: z.array(FeedSchema),
          }),
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "createFeed",
  method: "post",
  path: "/feeds",
  description:
    "Create a new RSS feed subscription. The feed will be periodically fetched and matching items will be imported as bookmarks.",
  summary: "Create a new feed",
  tags: ["Feeds"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "The feed to create.",
      content: {
        "application/json": {
          schema: zNewFeedSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "The created feed.",
      content: {
        "application/json": {
          schema: FeedSchema,
        },
      },
    },
    400: {
      description:
        "Bad request — e.g. the maximum number of RSS feeds per user has been reached.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "getFeed",
  method: "get",
  path: "/feeds/{feedId}",
  description: "Retrieve a single RSS feed subscription by its ID.",
  summary: "Get a single feed",
  tags: ["Feeds"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ feedId: FeedIdSchema }),
  },
  responses: {
    200: {
      description: "The requested feed.",
      content: {
        "application/json": {
          schema: FeedSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Feed not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "updateFeed",
  method: "patch",
  path: "/feeds/{feedId}",
  description:
    "Update an RSS feed subscription. Only provided fields will be changed.",
  summary: "Update a feed",
  tags: ["Feeds"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ feedId: FeedIdSchema }),
    body: {
      description: "The fields to update.",
      content: {
        "application/json": {
          schema: zUpdateFeedSchema.omit({ feedId: true }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated feed.",
      content: {
        "application/json": {
          schema: FeedSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Feed not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "deleteFeed",
  method: "delete",
  path: "/feeds/{feedId}",
  description:
    "Delete an RSS feed subscription. Previously imported bookmarks are not affected.",
  summary: "Delete a feed",
  tags: ["Feeds"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ feedId: FeedIdSchema }),
  },
  responses: {
    204: {
      description: "No content — the feed was deleted successfully.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "Feed not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "fetchFeedNow",
  method: "post",
  path: "/feeds/{feedId}/fetch",
  description:
    "Trigger an immediate fetch of the RSS feed. The fetch is enqueued and processed asynchronously.",
  summary: "Trigger a feed fetch",
  tags: ["Feeds"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ feedId: FeedIdSchema }),
  },
  responses: {
    204: {
      description: "No content — the fetch has been enqueued.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "Feed not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
