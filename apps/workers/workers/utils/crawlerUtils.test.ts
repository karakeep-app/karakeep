import { describe, expect, it } from "vitest";

import { normalizeBrowserUserAgent } from "./crawlerUtils";

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
