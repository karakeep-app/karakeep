import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { zBackupSchema } from "@karakeep/shared/types/backups";

import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

export const BackupIdSchema = registry.registerParameter(
  "BackupId",
  z.string().openapi({
    param: {
      name: "backupId",
      in: "path",
    },
    description: "The unique identifier of the backup.",
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  operationId: "listBackups",
  method: "get",
  path: "/backups",
  description:
    "Retrieve a list of all backups for the authenticated user, including their status and metadata.",
  summary: "Get all backups",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  responses: {
    200: {
      description: "A list of all backups.",
      content: {
        "application/json": {
          schema: z.object({
            backups: z.array(zBackupSchema),
          }),
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "createBackup",
  method: "post",
  path: "/backups",
  description:
    "Trigger a new full account backup. The backup is created asynchronously — use GET /backups/{backupId} to check its status.",
  summary: "Trigger a new backup",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  responses: {
    201: {
      description:
        "Backup creation was triggered. The backup object is returned with a 'pending' status.",
      content: {
        "application/json": {
          schema: zBackupSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "getBackup",
  method: "get",
  path: "/backups/{backupId}",
  description:
    "Retrieve metadata for a single backup, including its current status (pending, success, or failure).",
  summary: "Get a single backup",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ backupId: BackupIdSchema }),
  },
  responses: {
    200: {
      description: "The requested backup.",
      content: {
        "application/json": {
          schema: zBackupSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Backup not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "downloadBackup",
  method: "get",
  path: "/backups/{backupId}/download",
  description:
    "Download a completed backup as a zip archive. The backup must have a 'success' status.",
  summary: "Download a backup",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ backupId: BackupIdSchema }),
  },
  responses: {
    200: {
      description: "The backup file as a zip archive.",
      content: {
        "application/zip": {
          schema: z.instanceof(Blob),
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Backup not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "deleteBackup",
  method: "delete",
  path: "/backups/{backupId}",
  description: "Permanently delete a backup and its associated archive file.",
  summary: "Delete a backup",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ backupId: BackupIdSchema }),
  },
  responses: {
    204: {
      description: "No content — the backup was deleted successfully.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "Backup not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
