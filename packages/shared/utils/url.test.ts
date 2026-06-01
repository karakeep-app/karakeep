import { describe, expect, it } from "vitest";

import { setUrlHostnameFromResolvedAddress } from "./url";

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
