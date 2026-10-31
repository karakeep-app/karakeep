import nodeFetch, { Response } from "node-fetch";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("node-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node-fetch")>();
  return { ...actual, default: vi.fn() };
});

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

import { fetchWithProxy } from "./network";

const mockedFetch = vi.mocked(nodeFetch);

describe("fetchWithProxy redirect handling", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  test("follows redirects by default", async () => {
    mockedFetch
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "https://93.184.216.34/next" },
        }),
      )
      .mockResolvedValueOnce(new Response("done", { status: 200 }));

    const response = await fetchWithProxy("https://93.184.216.34/start");

    expect(response.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  test("returns the first redirect response untouched when redirect is manual", async () => {
    mockedFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: {
          location: "https://93.184.216.34/next",
          "set-cookie": "a=1; Path=/",
        },
      }),
    );

    const response = await fetchWithProxy("https://93.184.216.34/start", {
      redirect: "manual",
    });

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://93.184.216.34/next");
    expect(response.headers.raw()["set-cookie"]).toEqual(["a=1; Path=/"]);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  test("still validates the URL in manual mode", async () => {
    await expect(
      fetchWithProxy("http://127.0.0.1/", { redirect: "manual" }),
    ).rejects.toThrow(/disallowed IP/);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
