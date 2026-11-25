import { afterEach, describe, expect, test, vi } from "vitest";

import {
  assertTtsUrlAllowed,
  ttsFetch,
  TtsUrlNotAllowedError,
} from "./ttsFetch";

describe("assertTtsUrlAllowed", () => {
  test.each([
    "http://169.254.169.254/latest/meta-data",
    "http://169.254.170.2/v2/credentials",
    "http://[::ffff:169.254.169.254]/",
    "http://[::ffff:a9fe:a9fe]/",
    "http://[fd00:ec2::254]/",
    "file:///etc/passwd",
  ])("rejects %s", async (url) => {
    await expect(assertTtsUrlAllowed(url)).rejects.toBeInstanceOf(
      TtsUrlNotAllowedError,
    );
  });

  test.each([
    "http://127.0.0.1:8880/v1",
    "http://192.168.1.10:8880/v1",
    "http://[::1]:8880/v1",
    "http://localhost:8880/v1",
  ])("allows self-hosted address %s", async (url) => {
    await expect(assertTtsUrlAllowed(url)).resolves.toBeUndefined();
  });
});

describe("ttsFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("refuses to follow redirects", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await ttsFetch("http://127.0.0.1:8880/v1/audio/speech", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8880/v1/audio/speech",
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );
  });

  test("doesn't fetch blocked hosts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(ttsFetch("http://169.254.169.254/")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
