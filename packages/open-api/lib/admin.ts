import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
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
              confirmPassword: "SecurePassword123!",
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
            role: z.enum(["user", "admin"]).nullable().openapi({
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
          schema: z
            .object({
              newPassword: z.string().openapi({
                description: "New password",
                example: "NewSecurePassword123!",
              }),
              newPasswordConfirm: z.string().openapi({
                description: "Confirm new password",
                example: "NewSecurePassword123!",
              }),
            })
            .openapi({
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

// POST /admin/invites
registry.registerPath({
  method: "post",
  path: "/admin/invites",
  description:
    "Create a new invitation for a user by email. An invite email will be sent to the specified address. Admin access required.",
  summary: "Create invite",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              email: z.string().email().openapi({
                description: "Email address to send the invitation to",
                example: "newuser@example.com",
              }),
            })
            .openapi({
              example: {
                email: "newuser@example.com",
              },
            }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Invite created successfully",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().openapi({
              description: "Unique invite ID",
              example: "invite_abc123",
            }),
            email: z.string().openapi({
              description: "Email address the invite was sent to",
              example: "newuser@example.com",
            }),
          }),
        },
      },
    },
    400: {
      description:
        "Bad request - User with this email already exists or an active invite already exists for this email",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// GET /admin/invites
registry.registerPath({
  method: "get",
  path: "/admin/invites",
  description:
    "List all pending invitations with details about who created them. Admin access required.",
  summary: "List invites",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "Invites retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            invites: z.array(
              z.object({
                id: z.string().openapi({
                  description: "Unique invite ID",
                  example: "invite_abc123",
                }),
                email: z.string().openapi({
                  description: "Email address the invite was sent to",
                  example: "newuser@example.com",
                }),
                createdAt: z.date().openapi({
                  description: "When the invite was created",
                  example: "2025-01-15T10:30:00Z",
                }),
                invitedBy: z.object({
                  id: z.string().openapi({
                    description: "ID of the admin who created the invite",
                    example: "user_admin123",
                  }),
                  name: z.string().openapi({
                    description: "Name of the admin who created the invite",
                    example: "Admin User",
                  }),
                  email: z.string().openapi({
                    description: "Email of the admin who created the invite",
                    example: "admin@example.com",
                  }),
                }),
              }),
            ),
          }),
        },
      },
    },
    ...commonErrorResponses,
  },
});

// DELETE /admin/invites/:inviteId
registry.registerPath({
  method: "delete",
  path: "/admin/invites/{inviteId}",
  description:
    "Revoke a pending invitation. The invite will be deleted and can no longer be used. Admin access required.",
  summary: "Revoke invite",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({
      inviteId: z.string().openapi({
        description: "The ID of the invite to revoke",
        example: "invite_abc123",
      }),
    }),
  },
  responses: {
    200: {
      description: "Invite revoked successfully",
      content: {
        "application/json": {
          schema: successResponseSchema,
        },
      },
    },
    404: {
      description: "Invite not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});

// POST /admin/invites/:inviteId/resend
registry.registerPath({
  method: "post",
  path: "/admin/invites/{inviteId}/resend",
  description:
    "Resend an invitation email with a new token. The previous token will be invalidated. Admin access required.",
  summary: "Resend invite",
  tags: ["Admin"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({
      inviteId: z.string().openapi({
        description: "The ID of the invite to resend",
        example: "invite_abc123",
      }),
    }),
  },
  responses: {
    200: {
      description: "Invite resent successfully",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().openapi({
              description: "Unique invite ID",
              example: "invite_abc123",
            }),
            email: z.string().openapi({
              description: "Email address the invite was resent to",
              example: "newuser@example.com",
            }),
          }),
        },
      },
    },
    404: {
      description: "Invite not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...commonErrorResponses,
  },
});
