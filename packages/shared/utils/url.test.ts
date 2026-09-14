import { describe, expect, it } from "vitest";

import {
  isAllowedBookmarkUrl,
  isKnownLinkShortener,
  resolveShortenedBookmarkUrl,
  setUrlHostnameFromResolvedAddress,
} from "./url";

describe("setUrlHostnameFromResolvedAddress", () => {
  it("sets IPv4 addresses as URL hostnames", () => {
    const url = new URL("http://chrome:9222");

    setUrlHostnameFromResolvedAddress(url, "172.18.0.3");

    expect(url.toString()).toBe("http://172.18.0.3:9222/");
    expect(url.hostname).toBe("172.18.0.3");
  });

  it("brackets IPv6 addresses before assigning them to URL hostnames", () => {
    const url = new URL("http://chrome:9222");

    setUrlHostnameFromResolvedAddress(url, "fd3a:d485:7e1d:e::3");

    expect(url.toString()).toBe("http://[fd3a:d485:7e1d:e::3]:9222/");
    expect(url.hostname).toBe("[fd3a:d485:7e1d:e::3]");
  });

  it("preserves the existing path and query", () => {
    const url = new URL("http://chrome:9222/json/version?check=true");

    setUrlHostnameFromResolvedAddress(url, "fd3a:d485:7e1d:e::3");

    expect(url.toString()).toBe(
      "http://[fd3a:d485:7e1d:e::3]:9222/json/version?check=true",
    );
  });
});

describe("isAllowedBookmarkUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isAllowedBookmarkUrl("http://example.com")).toBe(true);
    expect(isAllowedBookmarkUrl("https://example.com/path?q=1#frag")).toBe(
      true,
    );
  });

  it("rejects script-executing schemes", () => {
    expect(isAllowedBookmarkUrl("javascript:alert(document.cookie)")).toBe(
      false,
    );
    expect(
      isAllowedBookmarkUrl("data:text/html,<script>alert(1)</script>"),
    ).toBe(false);
    expect(isAllowedBookmarkUrl("vbscript:MsgBox(1)")).toBe(false);
  });

  it("rejects scheme casing and whitespace tricks", () => {
    expect(isAllowedBookmarkUrl("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isAllowedBookmarkUrl(" javascript:alert(1)")).toBe(false);
    expect(isAllowedBookmarkUrl("java\tscript:alert(1)")).toBe(false);
  });

  it("rejects other non-web schemes", () => {
    expect(isAllowedBookmarkUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedBookmarkUrl("ftp://example.com/file")).toBe(false);
    expect(isAllowedBookmarkUrl("chrome://settings")).toBe(false);
  });

  it("rejects strings that are not URLs", () => {
    expect(isAllowedBookmarkUrl("not a url")).toBe(false);
    expect(isAllowedBookmarkUrl("")).toBe(false);
  });
});

describe("isKnownLinkShortener", () => {
  it("matches known shortener hosts", () => {
    expect(isKnownLinkShortener("https://search.app/abc123")).toBe(true);
    expect(isKnownLinkShortener("https://share.google/xyz")).toBe(true);
  });

  it("does not match ordinary destination hosts", () => {
    expect(isKnownLinkShortener("https://example.com/article")).toBe(false);
    expect(isKnownLinkShortener("https://news.google.com/story")).toBe(false);
  });

  it("does not match lookalike hosts that merely contain a shortener", () => {
    expect(isKnownLinkShortener("https://search.app.evil.com/")).toBe(false);
    expect(isKnownLinkShortener("https://notsearch.app/")).toBe(false);
  });

  it("returns false for non-URL input", () => {
    expect(isKnownLinkShortener("not a url")).toBe(false);
    expect(isKnownLinkShortener("")).toBe(false);
  });

  it("matches only the exact host, not subdomains", () => {
    // Google emits the bare hosts; we keep the trust boundary tight.
    expect(isKnownLinkShortener("https://www.search.app/abc")).toBe(false);
    expect(isKnownLinkShortener("https://l.share.google/xyz")).toBe(false);
  });
});

describe("resolveShortenedBookmarkUrl", () => {
  it("returns the resolved URL when a known shortener redirects elsewhere", () => {
    expect(
      resolveShortenedBookmarkUrl(
        "https://search.app/abc123",
        "https://realsite.com/article",
      ),
    ).toBe("https://realsite.com/article");
    expect(
      resolveShortenedBookmarkUrl(
        "https://share.google/xyz",
        "https://news.example.com/story?id=5",
      ),
    ).toBe("https://news.example.com/story?id=5");
  });

  it("returns undefined when the original URL is not a known shortener", () => {
    expect(
      resolveShortenedBookmarkUrl(
        "https://example.com/short",
        "https://example.com/canonical",
      ),
    ).toBeUndefined();
  });

  it("returns undefined when the crawler did not change the URL", () => {
    expect(
      resolveShortenedBookmarkUrl(
        "https://search.app/abc",
        "https://search.app/abc",
      ),
    ).toBeUndefined();
  });

  it("returns undefined when the resolved URL is not a safe web URL", () => {
    // A shortener must never be able to rewrite a bookmark to a dangerous scheme.
    expect(
      resolveShortenedBookmarkUrl(
        "https://search.app/abc",
        "javascript:alert(document.cookie)",
      ),
    ).toBeUndefined();
    expect(
      resolveShortenedBookmarkUrl(
        "https://search.app/abc",
        "file:///etc/passwd",
      ),
    ).toBeUndefined();
  });

  it("returns undefined for a lookalike shortener host", () => {
    expect(
      resolveShortenedBookmarkUrl(
        "https://search.app.evil.com/abc",
        "https://evil.com/payload",
      ),
    ).toBeUndefined();
  });
});
