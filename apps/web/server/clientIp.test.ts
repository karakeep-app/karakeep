import { describe, expect, test, vi } from "vitest";

import { buildTrustedProxies, getClientIp } from "./clientIp";

function ipFor(
  headers: Record<string, string>,
  trusted: string[] = ["private"],
) {
  return getClientIp(new Headers(headers), buildTrustedProxies(trusted));
}

describe("getClientIp", () => {
  test("returns null without X-Forwarded-For", () => {
    expect(ipFor({})).toBeNull();
  });

  test("uses the connecting address Next.js fills in when there's no proxy", () => {
    expect(ipFor({ "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7");
  });

  test("ignores values a client puts in front of the proxy's entry", () => {
    // Client sent "1.2.3.4"; the proxy appended the real address.
    expect(ipFor({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" })).toBe(
      "203.0.113.7",
    );
  });

  test("skips every trusted proxy in a chain", () => {
    // Cloudflare Tunnel (loopback) -> nginx (Docker network).
    expect(
      ipFor({
        "x-forwarded-for": "1.2.3.4, 203.0.113.7, 127.0.0.1, 172.18.0.5",
      }),
    ).toBe("203.0.113.7");
  });

  test("only skips addresses that are configured as trusted", () => {
    const xff = { "x-forwarded-for": "1.2.3.4, 203.0.113.7, 198.51.100.9" };
    expect(ipFor(xff)).toBe("198.51.100.9");
    expect(ipFor(xff, ["private", "198.51.100.0/24"])).toBe("203.0.113.7");
    expect(ipFor(xff, ["198.51.100.9"])).toBe("203.0.113.7");
  });

  test("trusts nothing with 'none'", () => {
    expect(ipFor({ "x-forwarded-for": "1.2.3.4, 172.18.0.5" }, ["none"])).toBe(
      "172.18.0.5",
    );
  });

  test("returns the left-most address when every entry is trusted", () => {
    // A client on the local network, behind a local proxy.
    expect(ipFor({ "x-forwarded-for": "192.168.1.10, 172.18.0.5" })).toBe(
      "192.168.1.10",
    );
  });

  test("never reads other client-IP headers", () => {
    expect(
      ipFor({
        "x-forwarded-for": "203.0.113.7",
        "x-client-ip": "1.2.3.4",
        "x-real-ip": "1.2.3.4",
        "cf-connecting-ip": "1.2.3.4",
        "true-client-ip": "1.2.3.4",
      }),
    ).toBe("203.0.113.7");
  });

  test("handles IPv6, ports and IPv4-mapped addresses", () => {
    expect(ipFor({ "x-forwarded-for": "2001:db8::1, fd00::2" })).toBe(
      "2001:db8::1",
    );
    expect(ipFor({ "x-forwarded-for": "[2001:db8::1]:443" })).toBe(
      "2001:db8::1",
    );
    expect(ipFor({ "x-forwarded-for": "203.0.113.7:51234" })).toBe(
      "203.0.113.7",
    );
    expect(ipFor({ "x-forwarded-for": "::ffff:203.0.113.7" })).toBe(
      "203.0.113.7",
    );
    expect(ipFor({ "x-forwarded-for": "203.0.113.7, ::ffff:172.18.0.5" })).toBe(
      "203.0.113.7",
    );
  });

  test("stops at entries it can't parse", () => {
    expect(ipFor({ "x-forwarded-for": "1.2.3.4, unknown, 172.18.0.5" })).toBe(
      "172.18.0.5",
    );
    expect(ipFor({ "x-forwarded-for": "garbage" })).toBeNull();
  });
});

describe("TRUSTED_PROXIES config", () => {
  async function loadTrustedProxies(value?: string) {
    vi.resetModules();
    if (value !== undefined) {
      vi.stubEnv("TRUSTED_PROXIES", value);
    }
    try {
      return (await import("@karakeep/shared/config")).default.trustedProxies;
    } finally {
      vi.unstubAllEnvs();
    }
  }

  test("defaults to the private ranges", async () => {
    expect(await loadTrustedProxies()).toEqual(["private"]);
  });

  test("accepts IPs, CIDR ranges and keywords", async () => {
    expect(
      await loadTrustedProxies(" private, 203.0.113.7 ,2001:db8::/32,none"),
    ).toEqual(["private", "203.0.113.7", "2001:db8::/32", "none"]);
  });

  test.each(["proxy.local", "10.0.0.0/33", "10.0.0.1:80"])(
    "rejects %s at startup",
    async (value) => {
      await expect(loadTrustedProxies(value)).rejects.toThrow(
        /TRUSTED_PROXIES/,
      );
    },
  );
});
