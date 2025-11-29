import AdmZip from "adm-zip";
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

  it("should trigger a backup and return the backup record", async () => {
    const { data: backup, response } = await client.POST("/backups");

    expect(response.status).toBe(201);
    expect(backup).toBeDefined();
    expect(backup!.id).toBeDefined();
    expect(backup!.userId).toBeDefined();
    expect(backup!.assetId).toBeDefined();
    expect(backup!.status).toBe("pending");
    expect(backup!.size).toBe(0);
    expect(backup!.bookmarkCount).toBe(0);

    // Verify the backup appears in the list
    const { data: backupsData } = await client.GET("/backups");
    expect(backupsData).toBeDefined();
    expect(backupsData!.backups).toBeDefined();
    expect(backupsData!.backups.some((b) => b.id === backup!.id)).toBe(true);
  });

  it("should get and delete a backup", async () => {
    // First trigger a backup
    const { data: createdBackup } = await client.POST("/backups");
    expect(createdBackup).toBeDefined();

    const backupId = createdBackup!.id;

    // Get the specific backup
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
    expect(backup!.status).toBe("pending");

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
    const { data: backup1 } = await client.POST("/backups");
    const { data: backup2 } = await client.POST("/backups");

    expect(backup1).toBeDefined();
    expect(backup2).toBeDefined();
    expect(backup1!.id).not.toBe(backup2!.id);

    // Get all backups
    const { data: backupsData, response } = await client.GET("/backups");

    expect(response.status).toBe(200);
    expect(backupsData).toBeDefined();
    expect(backupsData!.backups).toBeDefined();
    expect(Array.isArray(backupsData!.backups)).toBe(true);
    expect(backupsData!.backups.length).toBeGreaterThanOrEqual(2);
    expect(backupsData!.backups.some((b) => b.id === backup1!.id)).toBe(true);
    expect(backupsData!.backups.some((b) => b.id === backup2!.id)).toBe(true);
  });

  it("should validate full backup lifecycle", async () => {
    // Step 1: Create some test bookmarks
    const bookmarks = [];
    for (let i = 0; i < 3; i++) {
      const { data: bookmark } = await client.POST("/bookmarks", {
        body: {
          type: "text",
          title: `Test Bookmark ${i + 1}`,
          text: `This is test bookmark number ${i + 1}`,
        },
      });
      expect(bookmark).toBeDefined();
      bookmarks.push(bookmark!);
    }

    // Step 2: Trigger a backup
    const { data: createdBackup, response: createResponse } =
      await client.POST("/backups");

    expect(createResponse.status).toBe(201);
    expect(createdBackup).toBeDefined();
    expect(createdBackup!.id).toBeDefined();
    expect(createdBackup!.status).toBe("pending");
    expect(createdBackup!.bookmarkCount).toBe(0);
    expect(createdBackup!.size).toBe(0);

    const backupId = createdBackup!.id;

    // Step 3: Poll until backup is completed or failed
    let backup;
    let attempts = 0;
    const maxAttempts = 60; // Wait up to 60 seconds
    const pollInterval = 1000; // Poll every second

    while (attempts < maxAttempts) {
      const { data: currentBackup } = await client.GET("/backups/{backupId}", {
        params: {
          path: {
            backupId,
          },
        },
      });

      backup = currentBackup;

      if (backup!.status === "success" || backup!.status === "failure") {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      attempts++;
    }

    // Step 4: Verify backup completed successfully
    expect(backup).toBeDefined();
    expect(backup!.status).toBe("success");
    expect(backup!.bookmarkCount).toBeGreaterThanOrEqual(3);
    expect(backup!.size).toBeGreaterThan(0);
    expect(backup!.errorMessage).toBeNull();

    // Step 5: Download the backup
    const downloadResponse = await fetch(
      `http://localhost:${port}/api/v1/backups/${backupId}/download`,
      {
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
      },
    );

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-type")).toContain(
      "application/zip",
    );

    const backupBlob = await downloadResponse.blob();
    expect(backupBlob.size).toBeGreaterThan(0);
    expect(backupBlob.size).toBe(backup!.size);

    // Step 6: Unzip and validate the backup contents
    const arrayBuffer = await backupBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify it's a valid ZIP file (starts with PK signature)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'

    // Unzip the backup file
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    // Should contain exactly one JSON file
    expect(zipEntries.length).toBe(1);
    const jsonEntry = zipEntries[0];
    expect(jsonEntry.entryName).toMatch(/^karakeep-backup-.*\.json$/);

    // Extract and parse the JSON content
    const jsonContent = jsonEntry.getData().toString("utf8");
    const backupData = JSON.parse(jsonContent);

    // Validate the backup structure
    expect(backupData).toBeDefined();
    expect(backupData.bookmarks).toBeDefined();
    expect(Array.isArray(backupData.bookmarks)).toBe(true);
    expect(backupData.bookmarks.length).toBeGreaterThanOrEqual(3);

    // Validate that our test bookmarks are in the backup
    const backupTitles = backupData.bookmarks.map(
      (b: { title: string }) => b.title,
    );
    expect(backupTitles).toContain("Test Bookmark 1");
    expect(backupTitles).toContain("Test Bookmark 2");
    expect(backupTitles).toContain("Test Bookmark 3");

    // Validate bookmark structure
    const firstBookmark = backupData.bookmarks[0];
    expect(firstBookmark).toHaveProperty("content");
    expect(firstBookmark.content).toHaveProperty("type");

    // Step 7: Verify the backup appears in the list with updated status
    const { data: backupsData } = await client.GET("/backups");
    const listedBackup = backupsData!.backups.find((b) => b.id === backupId);

    expect(listedBackup).toBeDefined();
    expect(listedBackup!.status).toBe("success");
    expect(listedBackup!.bookmarkCount).toBe(backup!.bookmarkCount);
    expect(listedBackup!.size).toBe(backup!.size);
  });
});
