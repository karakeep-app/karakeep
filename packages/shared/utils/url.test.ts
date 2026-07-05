import { describe, expect, it } from "vitest";

import { isAllowedBookmarkUrl, setUrlHostnameFromResolvedAddress } from "./url";

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
