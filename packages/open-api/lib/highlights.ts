import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";

import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";
import { PaginationSchema } from "./pagination";
import { HighlightSchema, PaginatedHighlightsSchema } from "./types";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

export const HighlightIdSchema = registry.registerParameter(
  "HighlightId",
  z.string().openapi({
    param: {
      name: "highlightId",
      in: "path",
    },
    description: "The unique identifier of the highlight.",
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  operationId: "listHighlights",
  method: "get",
  path: "/highlights",
  description:
    "Retrieve a paginated list of all highlights across all bookmarks for the authenticated user.",
  summary: "Get all highlights",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: PaginationSchema,
  },
  responses: {
    200: {
      description: "A paginated list of highlights.",
      content: {
        "application/json": {
          schema: PaginatedHighlightsSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "createHighlight",
  method: "post",
  path: "/highlights",
  description:
    "Create a new text highlight on a bookmark. Highlights are defined by character offsets within the bookmark's content and support color coding.",
  summary: "Create a new highlight",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description:
        "The highlight to create, including the bookmark ID, text offsets, and optional color/note.",
      content: {
        "application/json": {
          schema: zNewHighlightSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "The created highlight.",
      content: {
        "application/json": {
          schema: HighlightSchema,
        },
      },
    },
    400: {
      description: "Bad request — invalid offsets or missing required fields.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description:
        "Bookmark not found — the specified bookmarkId does not exist.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "getHighlight",
  method: "get",
  path: "/highlights/{highlightId}",
  description: "Retrieve a single highlight by its ID.",
  summary: "Get a single highlight",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ highlightId: HighlightIdSchema }),
  },
  responses: {
    200: {
      description: "The requested highlight.",
      content: {
        "application/json": {
          schema: HighlightSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Highlight not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "deleteHighlight",
  method: "delete",
  path: "/highlights/{highlightId}",
  description: "Delete a highlight by its ID.",
  summary: "Delete a highlight",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ highlightId: HighlightIdSchema }),
  },
  responses: {
    200: {
      description: "The deleted highlight is returned.",
      content: {
        "application/json": {
          schema: HighlightSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Highlight not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "updateHighlight",
  method: "patch",
  path: "/highlights/{highlightId}",
  description:
    "Partially update a highlight. Supports changing the color or note.",
  summary: "Update a highlight",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ highlightId: HighlightIdSchema }),
    body: {
      description:
        "The fields to update. Only the fields you want to change need to be provided.",
      content: {
        "application/json": {
          schema: zUpdateHighlightSchema.omit({ highlightId: true }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated highlight.",
      content: {
        "application/json": {
          schema: HighlightSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Highlight not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
