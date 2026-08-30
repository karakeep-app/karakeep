import { describe, expect, it, vi } from "vitest";

import type { DB, KarakeepDBTransaction } from "@karakeep/db";

import { QuotaService } from "./quotaService";

describe("QuotaService bookmark quota", () => {
  it("keeps the DB entry point asynchronous", async () => {
    const findFirst = vi.fn().mockResolvedValue({ bookmarkQuota: 1 });
    const where = vi.fn().mockResolvedValue([{ count: 1 }]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = {
      query: { users: { findFirst } },
      select,
    } as unknown as DB;

    const resultPromise = QuotaService.canCreateBookmark(db, "user-id");

    expect(resultPromise).toBeInstanceOf(Promise);
    await expect(resultPromise).resolves.toEqual({
      result: false,
      error: "Bookmark quota exceeded. You can only have 1 bookmarks.",
    });
  });

  it("keeps the transaction entry point synchronous", () => {
    const sync = vi.fn().mockReturnValue({ bookmarkQuota: 2 });
    const all = vi.fn().mockReturnValue([{ count: 1 }]);
    const where = vi.fn().mockReturnValue({ all });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const tx = {
      query: { users: { findFirst: vi.fn().mockReturnValue({ sync }) } },
      select,
    } as unknown as KarakeepDBTransaction;

    const result = QuotaService.canCreateBookmarkInTransaction(tx, "user-id");

    expect(result).toEqual({ result: true });
    expect(result).not.toBeInstanceOf(Promise);
    expect(sync).toHaveBeenCalledOnce();
    expect(all).toHaveBeenCalledOnce();
  });
});
