import { describe, expect, it } from "vitest";

import type {
  PreparedCopy,
  StoredCopy,
  SyncCandidate,
  SyncDeps,
} from "./offlineSyncEngine";
import {
  ContentUnavailable,
  planRoomFor,
  selectCandidates,
  synchronizeOfflineCopies,
  SyncInterrupted,
} from "./offlineSyncEngine";
import { assetBookmark, linkBookmark, textBookmark } from "./testing/bookmarks";

const NOW = 1_000_000_000;

function candidate(bookmarkId: string, ready = true): SyncCandidate {
  return { bookmarkId, ready };
}

function copy(
  bookmarkId: string,
  overrides: Partial<StoredCopy> = {},
): StoredCopy {
  return {
    bookmarkId,
    source: "auto",
    byteSize: 10,
    savedAt: NOW - 1000,
    ...overrides,
  };
}

function harness({
  stored = [],
  budgetBytes = 1000,
  sizes = {},
  failing = new Set<string>(),
  checkpoint = async () => undefined,
}: {
  stored?: StoredCopy[];
  budgetBytes?: number;
  sizes?: Record<string, number>;
  failing?: Set<string>;
  checkpoint?: () => Promise<void>;
} = {}) {
  const library = new Map(stored.map((item) => [item.bookmarkId, item]));
  const downloads: string[] = [];
  const excluded = new Set<string>();
  const deps: SyncDeps = {
    budgetBytes,
    knownSizes: new Map(),
    listStored: () => [...library.values()],
    isExcluded: (bookmarkId) => excluded.has(bookmarkId),
    checkpoint,
    remove: (bookmarkId) => {
      library.delete(bookmarkId);
    },
    prepare: async (next): Promise<PreparedCopy> => {
      downloads.push(next.bookmarkId);
      if (failing.has(next.bookmarkId)) {
        throw new Error("download failed");
      }
      const byteSize = sizes[next.bookmarkId] ?? 10;
      return {
        byteSize,
        save: () => {
          library.set(next.bookmarkId, {
            bookmarkId: next.bookmarkId,
            source: "auto",
            byteSize,
            savedAt: NOW,
          });
        },
      };
    },
  };
  return {
    deps,
    downloads,
    excluded,
    ids: () => [...library.keys()].sort(),
  };
}

describe("selectCandidates", () => {
  it("puts list articles first, newest first, without duplicates", () => {
    const result = selectCandidates(
      [
        linkBookmark("list-old", { createdAt: 1 }),
        linkBookmark("both", { createdAt: 5 }),
      ],
      [
        linkBookmark("recent", { createdAt: 9 }),
        linkBookmark("both", { createdAt: 5 }),
      ],
      [],
    );
    expect(result.map((item) => item.bookmarkId)).toEqual([
      "both",
      "list-old",
      "recent",
    ]);
  });

  it("drops exclusions and assets, and marks pending crawls", () => {
    // Older servers report neither a crawl status nor a crawl time.
    const link = linkBookmark("uncrawled", { createdAt: 3 });
    const uncrawled = {
      ...link,
      content: {
        ...link.content,
        crawlStatus: undefined,
        crawledAt: undefined,
      },
    };
    const result = selectCandidates(
      [],
      [
        linkBookmark("excluded", { createdAt: 6 }),
        assetBookmark("pdf", 5),
        linkBookmark("broken", { createdAt: 4, crawlStatus: "failure" }),
        linkBookmark("pending", { createdAt: 3, crawlStatus: "pending" }),
        uncrawled,
        textBookmark("note", 2),
      ],
      ["excluded"],
    );
    expect(result).toEqual([
      // A failed crawl may have kept an earlier crawl's content.
      { bookmarkId: "broken", ready: true },
      { bookmarkId: "pending", ready: false },
      { bookmarkId: "uncrawled", ready: false },
      { bookmarkId: "note", ready: true },
    ]);
  });
});

describe("planRoomFor", () => {
  const ranks = new Map([
    ["a", 0],
    ["b", 1],
    ["c", 2],
  ]);
  const priority = (id: string) => ranks.get(id) ?? Number.POSITIVE_INFINITY;

  it("evicts unwanted copies first, then the lowest priority", () => {
    const stored = [
      copy("b"),
      copy("c"),
      copy("gone"),
      copy("mine", { source: "manual" }),
    ];
    expect(
      planRoomFor(
        { bookmarkId: "a", byteSize: 10, rank: 0 },
        stored,
        priority,
        30,
      ),
    ).toEqual(["gone", "c"]);
  });

  it("evicts nothing when even evicting everything allowed is not enough", () => {
    const stored = [copy("a"), copy("c"), copy("mine", { source: "manual" })];
    expect(
      planRoomFor(
        { bookmarkId: "b", byteSize: 25, rank: 1 },
        stored,
        priority,
        30,
      ),
    ).toBeUndefined();
  });
});

describe("synchronizeOfflineCopies", () => {
  it("downloads only what is missing", async () => {
    const h = harness({
      stored: [copy("stored"), copy("mine", { source: "manual" })],
    });
    const result = await synchronizeOfflineCopies(
      [candidate("stored"), candidate("mine"), candidate("new")],
      h.deps,
    );
    expect(h.downloads).toEqual(["new"]);
    expect(result).toMatchObject({ total: 3, ready: 3, failed: 0 });
  });

  it("skips an article without reader content until the next pass", async () => {
    const h = harness();
    const prepare = h.deps.prepare;
    h.deps.prepare = async (next) => {
      if (next.bookmarkId === "empty") {
        h.downloads.push(next.bookmarkId);
        throw new ContentUnavailable();
      }
      return prepare(next);
    };
    const result = await synchronizeOfflineCopies(
      [candidate("empty"), candidate("a")],
      h.deps,
    );
    expect(result).toMatchObject({ total: 1, ready: 1, failed: 0 });

    await synchronizeOfflineCopies([candidate("empty")], h.deps);
    expect(h.downloads).toEqual(["empty", "a", "empty"]);
  });

  it("rotates out articles that left the selection", async () => {
    const h = harness({
      stored: [copy("old"), copy("mine", { source: "manual" })],
    });
    await synchronizeOfflineCopies([candidate("new")], h.deps);
    expect(h.ids()).toEqual(["mine", "new"]);
  });

  it("keeps one old article per failed download, newest first", async () => {
    const h = harness({
      stored: [
        copy("older", { savedAt: NOW - 2000 }),
        copy("old", { savedAt: NOW - 1000 }),
      ],
      failing: new Set(["new"]),
    });
    await synchronizeOfflineCopies(
      [candidate("new"), candidate("pending", false)],
      h.deps,
    );
    expect(h.ids()).toEqual(["old", "older"]);

    const next = harness({
      stored: [
        copy("older", { savedAt: NOW - 2000 }),
        copy("old", { savedAt: NOW - 1000 }),
      ],
      failing: new Set(["new"]),
    });
    await synchronizeOfflineCopies([candidate("new")], next.deps);
    expect(next.ids()).toEqual(["old"]);
  });

  it("does not download articles that are still being crawled", async () => {
    const h = harness();
    const result = await synchronizeOfflineCopies(
      [candidate("pending", false)],
      h.deps,
    );
    expect(h.downloads).toEqual([]);
    expect(result.failed).toBe(1);
  });

  it("makes room by evicting lower-priority automatic copies only", async () => {
    const h = harness({
      budgetBytes: 30,
      stored: [copy("mine", { source: "manual" }), copy("b"), copy("c")],
    });
    await synchronizeOfflineCopies(
      [candidate("a"), candidate("b"), candidate("c")],
      h.deps,
    );
    expect(h.ids()).toEqual(["a", "b", "mine"]);
  });

  it("stops at the budget and keeps higher-priority copies", async () => {
    const h = harness({
      budgetBytes: 30,
      sizes: { c: 20 },
      stored: [copy("a"), copy("b")],
    });
    const result = await synchronizeOfflineCopies(
      [candidate("a"), candidate("b"), candidate("c"), candidate("d")],
      h.deps,
    );
    expect(h.ids()).toEqual(["a", "b"]);
    expect(h.downloads).toEqual(["c"]);
    expect(result).toMatchObject({ budgetReached: true, ready: 2, total: 4 });

    // Next pass: the size is known, so it isn't downloaded again.
    await synchronizeOfflineCopies(
      [candidate("a"), candidate("b"), candidate("c")],
      h.deps,
    );
    expect(h.downloads).toEqual(["c"]);
  });

  it("shrinks to a lowered budget without touching manual copies", async () => {
    const h = harness({
      budgetBytes: 15,
      stored: [
        copy("mine", { source: "manual", byteSize: 20 }),
        copy("a"),
        copy("b"),
      ],
    });
    await synchronizeOfflineCopies([candidate("a"), candidate("b")], h.deps);
    expect(h.ids()).toEqual(["mine"]);
    // Their sizes were known, so they weren't downloaded again to check.
    expect(h.downloads).toEqual([]);
  });

  it("does not evict anything when saving fails", async () => {
    const h = harness({ budgetBytes: 20, stored: [copy("b"), copy("c")] });
    const prepare = h.deps.prepare;
    h.deps.prepare = async (next) => ({
      ...(await prepare(next)),
      save: () => {
        throw new Error("disk full");
      },
    });
    const result = await synchronizeOfflineCopies(
      [candidate("a"), candidate("b"), candidate("c")],
      h.deps,
    );
    expect(h.ids()).toEqual(["b", "c"]);
    expect(result.failed).toBe(1);
  });

  it("stops without cleaning up when interrupted", async () => {
    let calls = 0;
    const h = harness({
      stored: [copy("old")],
      checkpoint: async () => {
        calls += 1;
        // The first two are before anything changes and before "a".
        if (calls > 2) {
          throw new SyncInterrupted("offline");
        }
      },
    });
    await expect(
      synchronizeOfflineCopies([candidate("a"), candidate("b")], h.deps),
    ).rejects.toBeInstanceOf(SyncInterrupted);
    expect(h.ids()).toEqual(["a", "old"]);
  });

  it("touches nothing when the pass must stop before it starts", async () => {
    const h = harness({
      budgetBytes: 5,
      stored: [copy("a"), copy("gone")],
      checkpoint: async () => {
        throw new SyncInterrupted("cancelled");
      },
    });
    await expect(
      synchronizeOfflineCopies([candidate("a")], h.deps),
    ).rejects.toBeInstanceOf(SyncInterrupted);
    expect(h.ids()).toEqual(["a", "gone"]);
  });

  it("treats a failed download as an interruption when the pass must stop", async () => {
    let offline = false;
    const h = harness({
      failing: new Set(["a"]),
      checkpoint: async () => {
        if (offline) {
          throw new SyncInterrupted("offline");
        }
      },
    });
    const prepare = h.deps.prepare;
    h.deps.prepare = async (next) => {
      offline = true;
      return prepare(next);
    };
    await expect(
      synchronizeOfflineCopies([candidate("a")], h.deps),
    ).rejects.toBeInstanceOf(SyncInterrupted);
  });

  it("skips articles excluded while the pass runs", async () => {
    const h = harness();
    const prepare = h.deps.prepare;
    h.deps.prepare = async (next) => {
      h.excluded.add(next.bookmarkId);
      return prepare(next);
    };
    await synchronizeOfflineCopies([candidate("a")], h.deps);
    expect(h.ids()).toEqual([]);
  });
});
