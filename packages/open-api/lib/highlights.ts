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
import { ErrorSchema } from "./errors";
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
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  method: "get",
  path: "/highlights",
  description: "Get all highlights",
  summary: "Get all highlights",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: PaginationSchema,
  },
  responses: {
    200: {
      description: "Object with all highlights data.",
      content: {
        "application/json": {
          schema: PaginatedHighlightsSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/highlights",
  description: "Create a new highlight",
  summary: "Create a new highlight",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "The highlight to create",
      content: {
        "application/json": {
          schema: zNewHighlightSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "The created highlight",
      content: {
        "application/json": {
          schema: HighlightSchema,
        },
      },
    },
    400: {
      description: "Bad highlight request",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
registry.registerPath({
  method: "get",
  path: "/highlights/{highlightId}",
  description: "Get highlight by its id",
  summary: "Get a single highlight",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ highlightId: HighlightIdSchema }),
  },
  responses: {
    200: {
      description: "Object with highlight data.",
      content: {
        "application/json": {
          schema: HighlightSchema,
        },
      },
    },
    404: {
      description: "Highlight not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/highlights/{highlightId}",
  description: "Delete highlight by its id",
  summary: "Delete a highlight",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ highlightId: HighlightIdSchema }),
  },
  responses: {
    200: {
      description: "The deleted highlight",
      content: {
        "application/json": {
          schema: HighlightSchema,
        },
      },
    },
    404: {
      description: "Highlight not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/highlights/{highlightId}",
  description: "Update highlight by its id",
  summary: "Update a highlight",
  tags: ["Highlights"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ highlightId: HighlightIdSchema }),
    body: {
      description:
        "The data to update. Only the fields you want to update need to be provided.",
      content: {
        "application/json": {
          schema: zUpdateHighlightSchema.omit({ highlightId: true }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated highlight",
      content: {
        "application/json": {
          schema: HighlightSchema,
        },
      },
    },
    404: {
      description: "Highlight not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
