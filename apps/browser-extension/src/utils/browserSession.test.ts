import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBrowserSessionCredentials,
  getServerOrigin,
  requestBrowserSessionPermission,
} from "./browserSession";

const requestPermission = vi.fn<() => Promise<boolean>>();

beforeEach(() => {
  requestPermission.mockReset();
  vi.stubGlobal("chrome", { permissions: { request: requestPermission } });
});

describe("browser session origin scope", () => {
  it("keeps existing settings on the browser's default credential mode", () => {
    expect(
      getBrowserSessionCredentials({ address: "https://bookmarks.example" }),
    ).toBeUndefined();
  });

  it("enables cookies only for the opted-in server origin, including subpaths", () => {
    expect(
      getBrowserSessionCredentials({
        address: "https://bookmarks.example/karakeep",
        browserSessionOrigin: "https://bookmarks.example",
      }),
    ).toBe("include");
  });

  it.each([
    "https://other.example",
    "http://bookmarks.example",
    "https://bookmarks.example:8443",
    "https://bookmarks.example.attacker.example",
  ])("does not carry the opt-in to %s", (address) => {
    expect(
      getBrowserSessionCredentials({
        address,
        browserSessionOrigin: "https://bookmarks.example",
      }),
    ).toBeUndefined();
  });

  it.each([
    "",
    "not a URL",
    "file:///tmp/bookmarks",
    "javascript:alert(1)",
    "https://user:password@bookmarks.example",
  ])("rejects invalid or unsupported addresses: %s", (address) => {
    expect(getServerOrigin(address)).toBeUndefined();
    expect(getBrowserSessionCredentials({ address })).toBeUndefined();
  });
});

describe("optional host permission", () => {
  it("requests only the configured server and returns a denial unchanged", async () => {
    requestPermission.mockResolvedValue(false);
    const result = requestBrowserSessionPermission(
      "https://bookmarks.example/karakeep",
    );
    // The permission request is synchronous with the user gesture.
    expect(chrome.permissions.request).toHaveBeenCalledExactlyOnceWith({
      origins: ["https://bookmarks.example/*"],
    });
    expect(await result).toBe(false);
  });

  it.each([
    ["http://localhost:3000/karakeep", "http://localhost/*"],
    ["https://[::1]:8443/karakeep", "https://[::1]/*"],
  ])(
    "requests a cross-browser host pattern for %s",
    async (address, pattern) => {
      requestPermission.mockResolvedValue(true);
      expect(await requestBrowserSessionPermission(address)).toBe(true);
      expect(requestPermission).toHaveBeenCalledWith({ origins: [pattern] });
      expect(
        getBrowserSessionCredentials({
          address,
          browserSessionOrigin: new URL(address).origin,
        }),
      ).toBe("include");
    },
  );

  it("returns a successful grant", async () => {
    requestPermission.mockResolvedValue(true);
    expect(
      await requestBrowserSessionPermission("https://bookmarks.example"),
    ).toBe(true);
  });

  it("does not request permissions for invalid addresses", async () => {
    expect(await requestBrowserSessionPermission("file:///tmp/bookmarks")).toBe(
      false,
    );
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });
});
