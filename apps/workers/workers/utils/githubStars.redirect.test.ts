import dns from "node:dns/promises";
import fetch, { Response } from "node-fetch";
import { expect, test, vi } from "vitest";
import { readStarredPage } from "./githubStars";

vi.mock("node-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node-fetch")>()),
  default: vi.fn(),
}));

test("rejects a GitHub redirect without requesting its destination", async () => {
  const ipv4 = vi
    .spyOn(dns.Resolver.prototype, "resolve4")
    .mockResolvedValue(["93.184.216.34"]);
  const ipv6 = vi
    .spyOn(dns.Resolver.prototype, "resolve6")
    .mockResolvedValue([]);
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { location: "https://other.example/stars" },
    }),
  );
  try {
    await expect(readStarredPage("octocat", 1)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://api.github.com/"),
      expect.objectContaining({ redirect: "manual" }),
    );
  } finally {
    ipv4.mockRestore();
    ipv6.mockRestore();
  }
});
