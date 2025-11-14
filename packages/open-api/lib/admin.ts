import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { zAdminMaintenanceTaskSchema } from "@karakeep/shared-server";
import {
  resetPasswordSchema,
  updateUserSchema,
  zAdminCreateUserSchema,
} from "@karakeep/shared/types/admin";

import { BearerAuth } from "./common";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

const successResponseSchema = z.object({
  success: z.boolean(),
});

const errorResponseSchema = z.object({
  error: z.string(),
});

// Common error responses for all admin endpoints
const commonErrorResponses = {
  401: {
    description: "Unauthorized - Authentication required",
    content: {
      "application/json": {
        schema: errorResponseSchema,
      },
    },
  },
  403: {
    description: "Forbidden - Admin access required",
    content: {
      "application/json": {
        schema: errorResponseSchema,
      },
    },
  },
};

// GET /admin/stats
registry.registerPath({
  method: "get",
  path: "/admin/stats",
  description:
    "Get basic system statistics including total number of users and bookmarks. Admin access required.",
  summary: "Get system stats",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "System statistics retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            numUsers: z.number().openapi({
              description: "Total number of users in the system",
              example: 42,
            }),
            numBookmarks: z.number().openapi({
              description: "Total number of bookmarks in the system",
              example: 1337,
            }),
          }),
        },
      },
    },
    ...commonErrorResponses,
  },
});

// GET /admin/background-jobs/stats
registry.registerPath({
  method: "get",
  path: "/admin/background-jobs/stats",
  description:
    "Get statistics for all background job queues including crawl, inference, indexing, maintenance, video, webhook, asset preprocessing, and feed queues. Admin access required.",
  summary: "Get background job stats",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Background job statistics retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            crawlStats: z.object({
              queued: z.number().openapi({
                description: "Number of queued crawl jobs",
                example: 10,
              }),
              pending: z.number().openapi({
                description: "Number of pending crawl jobs",
                example: 5,
              }),
              failed: z.number().openapi({
                description: "Number of failed crawl jobs",
                example: 2,
              }),
            }),
            inferenceStats: z.object({
              queued: z.number().openapi({
                description: "Number of queued inference jobs",
                example: 15,
              }),
              pending: z.number().openapi({
                description: "Number of pending inference jobs",
                example: 3,
              }),
              failed: z.number().openapi({
                description: "Number of failed inference jobs",
                example: 1,
              }),
            }),
            indexingStats: z.object({
              queued: z.number().openapi({
                description: "Number of queued indexing jobs",
                example: 8,
              }),
            }),
            adminMaintenanceStats: z.object({
              queued: z.number().openapi({
                description: "Number of queued admin maintenance tasks",
                example: 0,
              }),
            }),
            videoStats: z.object({
              queued: z.number().openapi({
                description: "Number of queued video processing jobs",
                example: 2,
              }),
            }),
            webhookStats: z.object({
              queued: z.number().openapi({
                description: "Number of queued webhook jobs",
                example: 4,
              }),
            }),
            assetPreprocessingStats: z.object({
              queued: z.number().openapi({
                description: "Number of queued asset preprocessing jobs",
                example: 6,
              }),
            }),
            feedStats: z.object({
              queued: z.number().openapi({
                description: "Number of queued feed processing jobs",
                example: 1,
              }),
            }),
          }),
        },
      },
    },
    ...commonErrorResponses,
  },
});

// GET /admin/users/stats
registry.registerPath({
  method: "get",
  path: "/admin/users/stats",
  description:
    "Get per-user statistics including number of bookmarks and total asset sizes for each user. Admin access required.",
  summary: "Get user stats",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "User statistics retrieved successfully",
      content: {
        "application/json": {
          schema: z
            .record(
              z.string(),
              z.object({
                numBookmarks: z.number().openapi({
                  description: "Number of bookmarks for this user",
                  example: 50,
                }),
                assetSizes: z.number().openapi({
                  description: "Total size of assets for this user in bytes",
                  example: 1024000,
                }),
              }),
            )
            .openapi({
              description: "User statistics keyed by user ID",
              example: {
                user_123: {
                  numBookmarks: 50,
                  assetSizes: 1024000,
                },
                user_456: {
                  numBookmarks: 30,
                  assetSizes: 512000,
                },
              },
            }),
        },
      },
    },
    ...commonErrorResponses,
  },
});

// GET /admin/notices
registry.registerPath({
  method: "get",
  path: "/admin/notices",
  description:
    "Get admin notices (currently unused). Admin access required.",
  summary: "Get admin notices",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Admin notices retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({}),
        },
      },
    },
    ...commonErrorResponses,
  },
});

// GET /admin/connections/check
registry.registerPath({
  method: "get",
  path: "/admin/connections/check",
  description:
    "Check the connection status of critical system components including search engine, browser, and queue services. Admin access required.",
  summary: "Check system connections",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Connection status retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            searchEngine: z.object({
              configured: z.boolean().openapi({
                description: "Whether search engine is configured",
                example: true,
              }),
              connected: z.boolean().openapi({
                description: "Whether search engine is connected",
                example: true,
              }),
              pluginName: z.string().optional().openapi({
                description: "Name of the search engine plugin",
                example: "Meilisearch",
              }),
              error: z.string().optional().openapi({
                description: "Error message if connection failed",
                example: "Connection timeout",
              }),
            }),
            browser: z.object({
              configured: z.boolean().openapi({
                description: "Whether browser is configured",
                example: true,
              }),
              connected: z.boolean().openapi({
                description: "Whether browser is connected",
                example: false,
              }),
              pluginName: z.string().optional().openapi({
                description: "Name of the browser plugin",
                example: "Browserless/Chrome",
              }),
              error: z.string().optional().openapi({
                description: "Error message if connection failed",
                example: "HTTP 503: Service Unavailable",
              }),
            }),
            queue: z.object({
              configured: z.boolean().openapi({
                description: "Whether queue is configured",
                example: true,
              }),
              connected: z.boolean().openapi({
                description: "Whether queue is connected",
                example: true,
              }),
              pluginName: z.string().optional().openapi({
                description: "Name of the queue plugin",
                example: "Restate",
              }),
              error: z.string().optional().openapi({
                description: "Error message if connection failed",
                example: "Connection refused",
              }),
            }),
          }),
        },
      },
    },
    ...commonErrorResponses,
  },
});

// POST /admin/links/recrawl
registry.registerPath({
  method: "post",
  path: "/admin/links/recrawl",
  description:
    "Recrawl links based on their current crawl status (success, failure, or all). Optionally run inference after recrawling. Admin access required.",
  summary: "Recrawl links",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              crawlStatus: z.enum(["success", "failure", "all"]).openapi({
                description:
                  "Filter links by crawl status: 'success' (previously successful), 'failure' (previously failed), or 'all' (all links)",
                example: "failure",
              }),
              runInference: z.boolean().openapi({
                description:
                  "Whether to run inference (tagging/summarization) after recrawling",
                example: true,
              }),
            })
            .openapi({
              example: {
                crawlStatus: "failure",
                runInference: true,
              },
            }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Links queued for recrawling successfully",
      content: {
        "application/json": {
          schema: successResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request - Invalid input data",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// POST /admin/bookmarks/reindex
registry.registerPath({
  method: "post",
  path: "/admin/bookmarks/reindex",
  description:
    "Clear the search index and reindex all bookmarks. This operation may take some time depending on the number of bookmarks. Admin access required.",
  summary: "Reindex all bookmarks",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Bookmarks queued for reindexing successfully",
      content: {
        "application/json": {
          schema: successResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// POST /admin/assets/reprocess
registry.registerPath({
  method: "post",
  path: "/admin/assets/reprocess",
  description:
    "Reprocess all bookmark assets in fix mode. This can be used to repair or regenerate asset processing. Admin access required.",
  summary: "Reprocess assets",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Assets queued for reprocessing successfully",
      content: {
        "application/json": {
          schema: successResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// POST /admin/bookmarks/inference
registry.registerPath({
  method: "post",
  path: "/admin/bookmarks/inference",
  description:
    "Re-run inference (tagging or summarization) on bookmarks based on their current status. Admin access required.",
  summary: "Re-run inference on bookmarks",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              type: z.enum(["tag", "summarize"]).openapi({
                description:
                  "Type of inference to run: 'tag' for tagging or 'summarize' for summarization",
                example: "tag",
              }),
              status: z.enum(["success", "failure", "all"]).openapi({
                description:
                  "Filter bookmarks by inference status: 'success' (previously successful), 'failure' (previously failed), or 'all' (all bookmarks)",
                example: "failure",
              }),
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
      description: "Bookmarks queued for inference successfully",
      content: {
        "application/json": {
          schema: successResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request - Invalid input data",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// POST /admin/maintenance/tasks
registry.registerPath({
  method: "post",
  path: "/admin/maintenance/tasks",
  description:
    "Run an admin maintenance task. Currently supports 'tidy_assets' and 'migrate_large_link_html' tasks. Admin access required.",
  summary: "Run maintenance task",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: zAdminMaintenanceTaskSchema.openapi({
            description:
              "Maintenance task configuration. Type can be 'tidy_assets' or 'migrate_large_link_html'.",
            example: {
              type: "tidy_assets",
              args: {
                dryRun: false,
              },
            },
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Maintenance task queued successfully",
      content: {
        "application/json": {
          schema: successResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request - Invalid task type or arguments",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// POST /admin/users
registry.registerPath({
  method: "post",
  path: "/admin/users",
  description:
    "Create a new user with optional admin role. Admin access required.",
  summary: "Create user",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: zAdminCreateUserSchema.openapi({
            description: "User creation data including credentials and role",
            example: {
              name: "John Doe",
              email: "john@example.com",
              password: "SecurePassword123!",
              passwordConfirm: "SecurePassword123!",
              role: "user",
            },
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "User created successfully",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().openapi({
              description: "Unique user ID",
              example: "user_abc123",
            }),
            name: z.string().openapi({
              description: "User's full name",
              example: "John Doe",
            }),
            email: z.string().openapi({
              description: "User's email address",
              example: "john@example.com",
            }),
            role: z
              .enum(["user", "admin"])
              .nullable()
              .openapi({
                description: "User's role",
                example: "user",
              }),
          }),
        },
      },
    },
    400: {
      description:
        "Bad request - Invalid input data, passwords don't match, or email already exists",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// PUT /admin/users/:userId
registry.registerPath({
  method: "put",
  path: "/admin/users/{userId}",
  description:
    "Update a user's role, bookmark quota, storage quota, or browser crawling settings. Cannot update own user. Admin access required.",
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
          schema: updateUserSchema.omit({ userId: true }).openapi({
            description:
              "User update data. All fields are optional - only provided fields will be updated.",
            example: {
              role: "admin",
              bookmarkQuota: 1000,
              storageQuota: 5000000000,
              browserCrawlingEnabled: true,
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
          schema: successResponseSchema,
        },
      },
    },
    400: {
      description:
        "Bad request - Invalid input data, cannot update own user, or no fields to update",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// PUT /admin/users/:userId/password
registry.registerPath({
  method: "put",
  path: "/admin/users/{userId}/password",
  description:
    "Reset a user's password. Cannot reset own password. Admin access required.",
  summary: "Reset user password",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({
      userId: z.string().openapi({
        description: "The ID of the user whose password to reset",
        example: "user_123",
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: resetPasswordSchema.omit({ userId: true }).openapi({
            description: "New password data",
            example: {
              newPassword: "NewSecurePassword123!",
              newPasswordConfirm: "NewSecurePassword123!",
            },
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Password reset successfully",
      content: {
        "application/json": {
          schema: successResponseSchema,
        },
      },
    },
    400: {
      description:
        "Bad request - Invalid input data, passwords don't match, or cannot reset own password",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});
