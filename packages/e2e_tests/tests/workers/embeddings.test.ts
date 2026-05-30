import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";

interface MeiliVectorDocument {
  id: string;
  userId: string;
}

describe("Embeddings Worker Tests", () => {
  const karakeepPort = inject("karakeepPort");
  const meiliPort = inject("meiliPort");

  if (!karakeepPort || !meiliPort) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  beforeEach(async () => {
    apiKey = await createTestUser();
    client = createKarakeepClient({
      baseUrl: `http://localhost:${karakeepPort}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it("indexes and deletes bookmark embeddings", async () => {
    const { data: createdBookmark, error } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Embedding worker text bookmark",
        text: "Karakeep should generate and index an embedding for this bookmark.",
      },
    });

    if (error) {
      throw error;
    }
    assert(createdBookmark);

    await waitUntil(async () => {
      const { data: bookmark } = await client.GET("/bookmarks/{bookmarkId}", {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
      });
      return bookmark?.embeddingStatus === "success";
    }, "Text bookmark embedding is indexed");

    const { response: deleteResponse } = await client.DELETE(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
      },
    );

    expect(deleteResponse.status).toBe(204);

    await waitUntil(async () => {
      const deletedVector = await getVectorDocument(
        meiliPort,
        createdBookmark.id,
      );
      return deletedVector === null;
    }, "Text bookmark embedding is deleted");
  }, 120000);
});

async function getVectorDocument(
  meiliPort: number,
  bookmarkId: string,
): Promise<MeiliVectorDocument | null> {
  const response = await fetch(
    `http://localhost:${meiliPort}/indexes/bookmarks_vectors/documents/${bookmarkId}?fields=id,userId`,
    {
      headers: {
        Authorization: "Bearer dummy",
      },
    },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `Failed to fetch vector document: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as MeiliVectorDocument;
}
