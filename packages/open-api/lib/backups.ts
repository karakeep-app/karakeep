import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { zBackupSchema } from "@karakeep/shared/types/backups";

import { BearerAuth } from "./common";
import { ErrorSchema } from "./errors";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

export const BackupIdSchema = registry.registerParameter(
  "BackupId",
  z.string().openapi({
    param: {
      name: "backupId",
      in: "path",
    },
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  method: "get",
  path: "/backups",
  description: "Get all backups",
  summary: "Get all backups",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  responses: {
    200: {
      description: "Object with all backups data.",
      content: {
        "application/json": {
          schema: z.object({
            backups: z.array(zBackupSchema),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/backups",
  description: "Trigger a new backup",
  summary: "Trigger a new backup",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  responses: {
    201: {
      description: "Backup created successfully",
      content: {
        "application/json": {
          schema: zBackupSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/backups/{backupId}",
  description: "Get backup by its id",
  summary: "Get a single backup",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ backupId: BackupIdSchema }),
  },
  responses: {
    200: {
      description: "Object with backup data.",
      content: {
        "application/json": {
          schema: zBackupSchema,
        },
      },
    },
    404: {
      description: "Backup not found",
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
  path: "/backups/{backupId}/download",
  description: "Download backup file",
  summary: "Download a backup",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ backupId: BackupIdSchema }),
  },
  responses: {
    200: {
      description: "Backup file (zip archive)",
      content: {
        "application/zip": {
          schema: z.instanceof(Blob),
        },
      },
    },
    404: {
      description: "Backup not found",
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
  path: "/backups/{backupId}",
  description: "Delete backup by its id",
  summary: "Delete a backup",
  tags: ["Backups"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ backupId: BackupIdSchema }),
  },
  responses: {
    204: {
      description: "No content - the backup was deleted",
    },
    404: {
      description: "Backup not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
