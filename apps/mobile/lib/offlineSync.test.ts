import { describe, expect, it, vi } from "vitest";

import { syncOfflineArticles } from "./offlineSync";

const article = (id: string, type = "link") => ({
  id,
  content: { type },
  archived: false,
});
function setup(count = 2) {
  const controller = new AbortController();
  const list = vi.fn(async (_cursor: string | null) => ({
    bookmarks: [article("a"), article("b"), article("c")],
    nextCursor: null as string | null,
  }));
  const download = vi.fn(async (id: string) => article(id));
  const save = vi.fn();
  const prune = vi.fn();
  const onProgress = vi.fn();
  return {
    controller,
    options: {
      count,
      signal: controller.signal,
      list,
      download,
      save,
      prune,
      onProgress,
    },
  };
}

describe("automatic offline synchronization", () => {
  it("downloads only the requested most recent articles and prunes after success", async () => {
    const { options } = setup();
    expect(await syncOfflineArticles(options)).toEqual({
      completed: 2,
      total: 2,
      failed: 0,
    });
    expect(options.download.mock.calls).toEqual([["a"], ["b"]]);
    expect(options.prune).toHaveBeenCalledWith(new Set(["a", "b"]));
  });

  it("skips assets and duplicate entries across pages", async () => {
    const { options } = setup();
    options.list.mockImplementation(async (cursor) =>
      cursor === null
        ? {
            bookmarks: [article("asset", "asset"), article("a")],
            nextCursor: "next",
          }
        : { bookmarks: [article("a"), article("b", "text")], nextCursor: null },
    );
    await syncOfflineArticles(options);
    expect(options.download.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("keeps old copies after an individual download or storage failure", async () => {
    const { options } = setup();
    options.save.mockImplementation((bookmark) => {
      if (bookmark.id === "a") throw new Error("disk full");
    });
    expect(await syncOfflineArticles(options)).toEqual({
      completed: 2,
      total: 2,
      failed: 1,
    });
    expect(options.save).toHaveBeenCalledTimes(2);
    expect(options.prune).not.toHaveBeenCalled();
  });

  it("does not save a late response or prune after cancellation", async () => {
    const { controller, options } = setup();
    options.download.mockImplementation(async (id) => {
      controller.abort();
      return article(id);
    });
    await expect(syncOfflineArticles(options)).rejects.toThrow();
    expect(options.save).not.toHaveBeenCalled();
    expect(options.prune).not.toHaveBeenCalled();
  });

  it("retains existing copies when listing fails", async () => {
    const { options } = setup();
    options.list.mockRejectedValue(new Error("server unavailable"));
    await expect(syncOfflineArticles(options)).rejects.toThrow(
      "server unavailable",
    );
    expect(options.prune).not.toHaveBeenCalled();
  });

  it("stops repeated cursors without evicting data", async () => {
    const { options } = setup();
    options.list.mockResolvedValue({ bookmarks: [], nextCursor: "repeated" });
    expect(await syncOfflineArticles(options)).toMatchObject({
      incomplete: true,
    });
    expect(options.list).toHaveBeenCalledTimes(2);
    expect(options.prune).not.toHaveBeenCalled();
  });

  it("bounds scans through libraries containing only unsupported assets", async () => {
    const { options } = setup();
    options.list.mockImplementation(async () => ({
      bookmarks: [],
      nextCursor: String(options.list.mock.calls.length),
    }));
    expect(await syncOfflineArticles(options)).toMatchObject({
      incomplete: true,
    });
    expect(options.list).toHaveBeenCalledTimes(50);
    expect(options.prune).not.toHaveBeenCalled();
  });

  it("handles fewer articles than requested, including an empty library", async () => {
    const { options } = setup();
    options.list.mockResolvedValue({ bookmarks: [], nextCursor: null });
    expect(await syncOfflineArticles(options)).toEqual({
      completed: 0,
      total: 0,
      failed: 0,
    });
    expect(options.prune).toHaveBeenCalledWith(new Set());
  });

  it("does not accept another bookmark's response", async () => {
    const { options } = setup(1);
    options.download.mockResolvedValue(article("wrong"));
    expect((await syncOfflineArticles(options)).failed).toBe(1);
    expect(options.save).not.toHaveBeenCalled();
    expect(options.prune).not.toHaveBeenCalled();
  });

  it("downloads eligible articles found before the scan bound without pruning", async () => {
    const { options } = setup(3);
    options.list.mockImplementation(async () => ({
      bookmarks:
        options.list.mock.calls.length === 1
          ? [article("a"), article("b")]
          : [article("asset", "asset")],
      nextCursor: String(options.list.mock.calls.length),
    }));
    expect(await syncOfflineArticles(options)).toEqual({
      completed: 2,
      total: 2,
      failed: 0,
      incomplete: true,
    });
    expect(options.list).toHaveBeenCalledTimes(50);
    expect(options.download.mock.calls).toEqual([["a"], ["b"]]);
    expect(options.prune).not.toHaveBeenCalled();
  });

  it("downloads found articles after a repeated cursor and keeps existing copies", async () => {
    const { options } = setup(3);
    options.list.mockResolvedValue({
      bookmarks: [article("a")],
      nextCursor: "repeat",
    });
    expect((await syncOfflineArticles(options)).incomplete).toBe(true);
    expect(options.download).toHaveBeenCalledWith("a");
    expect(options.prune).not.toHaveBeenCalled();
  });

  it("excludes archived articles while filling the requested count across pages", async () => {
    const { options } = setup(2);
    options.list.mockImplementation(async (cursor) =>
      cursor === null
        ? {
            bookmarks: [
              { ...article("archived"), archived: true },
              article("a"),
            ],
            nextCursor: "next",
          }
        : { bookmarks: [article("b")], nextCursor: null },
    );
    await syncOfflineArticles({ ...options, excludeArchived: true });
    expect(options.download.mock.calls).toEqual([["a"], ["b"]]);
    expect(options.prune).toHaveBeenCalledWith(new Set(["a", "b"]));
  });

  it("includes archived articles when exclusion is disabled", async () => {
    const { options } = setup(1);
    options.list.mockResolvedValue({
      bookmarks: [{ ...article("archived"), archived: true }],
      nextCursor: null,
    });
    await syncOfflineArticles(options);
    expect(options.download).toHaveBeenCalledWith("archived");
  });

  it("does not save or prune if an article becomes archived during download", async () => {
    const { options } = setup(1);
    options.download.mockResolvedValue({ ...article("a"), archived: true });
    expect(
      (await syncOfflineArticles({ ...options, excludeArchived: true }))
        .incomplete,
    ).toBe(true);
    expect(options.save).not.toHaveBeenCalled();
    expect(options.prune).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 1001, Number.NaN])(
    "rejects an invalid count %s before network access",
    async (count) => {
      const { options } = setup(count);
      await expect(syncOfflineArticles(options)).rejects.toThrow(
        "Choose between",
      );
      expect(options.list).not.toHaveBeenCalled();
    },
  );
});
