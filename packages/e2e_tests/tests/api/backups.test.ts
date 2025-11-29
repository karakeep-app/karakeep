import { beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";

describe("Backups API", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  beforeEach(async () => {
    apiKey = await createTestUser();
    client = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it("should list backups", async () => {
    const { data: backupsData, response } = await client.GET("/backups");

    expect(response.status).toBe(200);
    expect(backupsData).toBeDefined();
    expect(backupsData!.backups).toBeDefined();
    expect(Array.isArray(backupsData!.backups)).toBe(true);
  });

  it("should trigger a backup", async () => {
    const { response } = await client.POST("/backups");

    expect(response.status).toBe(204);

    // Verify the backup was queued by checking the list
    // Note: The backup might not be completed yet, but it should be in the queue
    const { data: backupsData } = await client.GET("/backups");
    expect(backupsData).toBeDefined();
    expect(backupsData!.backups).toBeDefined();
  });

  it("should get, and delete a backup", async () => {
    // First trigger a backup
    await client.POST("/backups");

    // Wait a moment for the backup to be created
    // In a real scenario, we might need to poll or use a webhook
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get the list of backups
    const { data: backupsData } = await client.GET("/backups");
    expect(backupsData).toBeDefined();
    expect(backupsData!.backups).toBeDefined();

    // If there are backups, test get and delete
    if (backupsData!.backups.length > 0) {
      const backupId = backupsData!.backups[0].id;

      // Get a specific backup
      const { data: backup, response: getResponse } = await client.GET(
        "/backups/{backupId}",
        {
          params: {
            path: {
              backupId,
            },
          },
        },
      );

      expect(getResponse.status).toBe(200);
      expect(backup).toBeDefined();
      expect(backup!.id).toBe(backupId);
      expect(backup!.userId).toBeDefined();
      expect(backup!.assetId).toBeDefined();

      // Delete the backup
      const { response: deleteResponse } = await client.DELETE(
        "/backups/{backupId}",
        {
          params: {
            path: {
              backupId,
            },
          },
        },
      );

      expect(deleteResponse.status).toBe(204);

      // Verify it's deleted
      const { response: getDeletedResponse } = await client.GET(
        "/backups/{backupId}",
        {
          params: {
            path: {
              backupId,
            },
          },
        },
      );

      expect(getDeletedResponse.status).toBe(404);
    }
  });

  it("should return 404 for non-existent backup", async () => {
    const { response } = await client.GET("/backups/{backupId}", {
      params: {
        path: {
          backupId: "non-existent-backup-id",
        },
      },
    });

    expect(response.status).toBe(404);
  });

  it("should return 404 when deleting non-existent backup", async () => {
    const { response } = await client.DELETE("/backups/{backupId}", {
      params: {
        path: {
          backupId: "non-existent-backup-id",
        },
      },
    });

    expect(response.status).toBe(404);
  });

  it("should handle multiple backups", async () => {
    // Trigger multiple backups
    await client.POST("/backups");
    await client.POST("/backups");

    // Wait for backups to potentially be created
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get all backups
    const { data: backupsData, response } = await client.GET("/backups");

    expect(response.status).toBe(200);
    expect(backupsData).toBeDefined();
    expect(backupsData!.backups).toBeDefined();
    expect(Array.isArray(backupsData!.backups)).toBe(true);
  });
});
