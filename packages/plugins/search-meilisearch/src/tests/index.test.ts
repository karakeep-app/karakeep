import { describe, expect, test } from "vitest";

import { MeiliSearchProvider } from "../index";

interface TestSearchClient {
  search: (options: {
    query: string;
    includeMatchedContent: boolean;
    matchedContentLength: number;
  }) => Promise<{
    hits: {
      id: string;
      matchedContent: {
        text: string;
        startOffset: number;
        endOffset: number;
        matchStartOffset: number;
        matchEndOffset: number;
      } | null;
    }[];
  }>;
}

interface TestProvider {
  client: {
    getIndexes: () => Promise<{ results: { uid: string }[] }>;
    createIndex: () => Promise<{ taskUid: number }>;
    waitForTask: () => Promise<void>;
    getIndex: () => Promise<{
      getSettings: () => Promise<{
        filterableAttributes: string[];
        sortableAttributes: string[];
      }>;
      updateFilterableAttributes: () => Promise<{ taskUid: number }>;
      updateSortableAttributes: () => Promise<{ taskUid: number }>;
      waitForTask: () => Promise<void>;
      search: () => Promise<{
        hits: {
          id: string;
          content: string;
          _rankingScore: number;
          _matchesPosition: {
            content: { start: number; length: number }[];
          };
        }[];
        estimatedTotalHits: number;
        processingTimeMs: number;
      }>;
    }>;
  };
  getClient: () => Promise<TestSearchClient | null>;
}

describe("MeiliSearchProvider", () => {
  test("matched content excerpt always encloses the reported match", async () => {
    const provider = new MeiliSearchProvider() as unknown as TestProvider;

    const fakeIndex = {
      getSettings: async () => ({
        filterableAttributes: ["id", "userId"],
        sortableAttributes: ["createdAt"],
      }),
      updateFilterableAttributes: async () => ({ taskUid: 1 }),
      updateSortableAttributes: async () => ({ taskUid: 2 }),
      waitForTask: async () => undefined,
      search: async () => ({
        hits: [
          {
            id: "bookmark-1",
            content: "0123456789abcdefghij",
            _rankingScore: 1,
            _matchesPosition: {
              content: [{ start: 10, length: 6 }],
            },
          },
        ],
        estimatedTotalHits: 1,
        processingTimeMs: 1,
      }),
    };

    provider.client = {
      getIndexes: async () => ({ results: [] }),
      createIndex: async () => ({ taskUid: 1 }),
      waitForTask: async () => undefined,
      getIndex: async () => fakeIndex,
    };

    const client = await provider.getClient();
    const result = await client!.search({
      query: "abc",
      includeMatchedContent: true,
      matchedContentLength: 1,
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.matchedContent).toEqual({
      text: "abcdef",
      startOffset: 10,
      endOffset: 16,
      matchStartOffset: 10,
      matchEndOffset: 16,
    });
  });
});
