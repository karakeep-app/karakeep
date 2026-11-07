import { describe, expect, it } from "vitest";

import { normalizeBrowserUserAgent, withDownloadTimeout } from "./crawlerUtils";

describe("normalizeBrowserUserAgent", () => {
  it("drops the headless marker and reduces the version", () => {
    expect(
      normalizeBrowserUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.8037.57 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
    );
  });

  it("reduces the full version that headless-shell reports", () => {
    expect(
      normalizeBrowserUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.47 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    );
  });

  it("keeps an already reduced user agent and its platform unchanged", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
    expect(normalizeBrowserUserAgent(ua)).toBe(ua);
  });
});

describe("withDownloadTimeout", () => {
  it("aborts the download on its own budget without touching the job", async () => {
    const job = new AbortController();
    const signal = withDownloadTimeout(job.signal, 0.02);

    await new Promise((resolve) =>
      signal.addEventListener("abort", resolve, { once: true }),
    );

    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).name).toBe("TimeoutError");
    expect(job.signal.aborted).toBe(false);
  });

  it("still aborts when the job is aborted", () => {
    const job = new AbortController();
    const signal = withDownloadTimeout(job.signal, 60);
    const reason = new Error("Timed-out after 60 secs");

    job.abort(reason);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);
  });

  it.each([0.0015, 1.2345, 0.0001, 1e12])(
    "accepts a budget of %s seconds",
    (timeoutSec) => {
      const job = new AbortController();
      const signal = withDownloadTimeout(job.signal, timeoutSec);
      expect(signal).not.toBe(job.signal);
      expect(signal.aborted).toBe(false);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns the job signal itself for a budget of %s",
    (timeoutSec) => {
      const job = new AbortController();
      expect(withDownloadTimeout(job.signal, timeoutSec)).toBe(job.signal);
    },
  );
});
