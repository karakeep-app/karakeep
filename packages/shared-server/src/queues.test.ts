import { describe, expect, it } from "vitest";

import { buildCrawlIdempotencyKey } from "./queues";

describe("buildCrawlIdempotencyKey", () => {
  it("gives the same key whether a flag is left out or set to its default", () => {
    expect(
      buildCrawlIdempotencyKey({
        bookmarkId: "b1",
        archiveFullPage: true,
        offlineCopiesOnly: true,
      }),
    ).toBe(
      buildCrawlIdempotencyKey({
        offlineCopiesOnly: true,
        storePdf: false,
        archiveFullPage: true,
        bookmarkId: "b1",
      }),
    );
  });

  it("gives different keys for different crawls", () => {
    const base = { bookmarkId: "b1", archiveFullPage: true };
    expect(buildCrawlIdempotencyKey(base)).not.toBe(
      buildCrawlIdempotencyKey({ ...base, offlineCopiesOnly: true }),
    );
    expect(buildCrawlIdempotencyKey(base)).not.toBe(
      buildCrawlIdempotencyKey({ ...base, runInference: false }),
    );
  });
});
