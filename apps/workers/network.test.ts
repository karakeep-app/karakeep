import { describe, expect, test, vi } from "vitest";

vi.mock("@karakeep/shared/config", () => ({
  default: {
    allowedInternalHostnames: undefined,
    crawler: { ipValidation: { dnsResolverTimeoutSec: 1 } },
    proxy: {
      httpProxy: undefined,
      httpsProxy: undefined,
      noProxy: undefined,
    },
  },
}));

import { createPinnedLookup } from "./network";

describe("createPinnedLookup", () => {
  test("returns a previously validated address without another DNS lookup", async () => {
    const lookup = createPinnedLookup([
      "93.184.216.34",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]);

    const result = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup("rebind.example", {}, (error, address, family) => {
          if (error) {
            reject(error);
          } else if (typeof address !== "string" || family === undefined) {
            reject(new Error("Expected a single lookup result"));
          } else {
            resolve({ address, family });
          }
        });
      },
    );

    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
  });

  test("honors the socket's requested address family", async () => {
    const lookup = createPinnedLookup([
      "93.184.216.34",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]);

    const result = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup("rebind.example", { family: 6 }, (error, address, family) => {
          if (error) {
            reject(error);
          } else if (typeof address !== "string" || family === undefined) {
            reject(new Error("Expected a single lookup result"));
          } else {
            resolve({ address, family });
          }
        });
      },
    );

    expect(result).toEqual({
      address: "2606:2800:220:1:248:1893:25c8:1946",
      family: 6,
    });
  });

  test("returns all validated addresses when requested by the socket", async () => {
    const lookup = createPinnedLookup([
      "93.184.216.34",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]);

    const result = await new Promise<{ address: string; family: number }[]>(
      (resolve, reject) => {
        lookup("rebind.example", { all: true }, (error, addresses) => {
          if (error) {
            reject(error);
          } else if (typeof addresses === "string") {
            reject(new Error("Expected all lookup results"));
          } else {
            resolve(addresses);
          }
        });
      },
    );

    expect(result).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  test("refuses to return a forbidden address", async () => {
    const lookup = createPinnedLookup(["127.0.0.1", "169.254.169.254"]);

    const error = await new Promise<NodeJS.ErrnoException>(
      (resolve, reject) => {
        lookup("rebind.example", {}, (lookupError) => {
          if (lookupError) {
            resolve(lookupError);
          } else {
            reject(
              new Error("Expected the lookup to reject forbidden addresses"),
            );
          }
        });
      },
    );

    expect(error.code).toBe("ENOTFOUND");
  });

  test("never selects a forbidden address from a mixed result set", async () => {
    const lookup = createPinnedLookup(["127.0.0.1", "93.184.216.34"]);

    const result = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup("rebind.example", {}, (error, address, family) => {
          if (error) {
            reject(error);
          } else if (typeof address !== "string" || family === undefined) {
            reject(new Error("Expected a single lookup result"));
          } else {
            resolve({ address, family });
          }
        });
      },
    );

    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
  });
});

describe("IPv4-embedding IPv6 addresses", () => {
  // DNS can return these in AAAA records, and a NAT64/SIIT translator on the
  // host network routes them to the embedded IPv4 address, so they must be
  // judged by that address.
  test.each([
    "64:ff9b::7f00:1", // NAT64 -> 127.0.0.1
    "64:ff9b::a9fe:a9fe", // NAT64 -> 169.254.169.254
    "64:ff9b::a00:1", // NAT64 -> 10.0.0.1
    "::ffff:0:7f00:1", // IPv4-translated -> 127.0.0.1
    "::ffff:0:a9fe:a9fe", // IPv4-translated -> 169.254.169.254
    "::ffff:127.0.0.1", // IPv4-mapped -> 127.0.0.1
    "::ffff:169.254.169.254", // IPv4-mapped -> 169.254.169.254
  ])("refuses to return %s", async (address) => {
    const lookup = createPinnedLookup([address]);

    const error = await new Promise<NodeJS.ErrnoException>(
      (resolve, reject) => {
        lookup("rebind.example", { family: 6 }, (lookupError) => {
          if (lookupError) {
            resolve(lookupError);
          } else {
            reject(new Error(`Expected the lookup to reject ${address}`));
          }
        });
      },
    );

    expect(error.code).toBe("ENOTFOUND");
  });

  test("allows NAT64 addresses of public IPv4 hosts (DNS64 networks)", async () => {
    // 64:ff9b::808:808 -> 8.8.8.8
    const lookup = createPinnedLookup(["64:ff9b::808:808"]);

    const result = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup("dns64.example", { family: 6 }, (error, address, family) => {
          if (error) {
            reject(error);
          } else if (typeof address !== "string" || family === undefined) {
            reject(new Error("Expected a single lookup result"));
          } else {
            resolve({ address, family });
          }
        });
      },
    );

    expect(result).toEqual({ address: "64:ff9b::808:808", family: 6 });
  });
});
