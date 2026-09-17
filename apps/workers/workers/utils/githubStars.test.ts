import { Response } from "node-fetch";
import { expect, test, vi } from "vitest";
import { fetchWithProxy } from "../../network";
import { readStarredPage } from "./githubStars";

vi.mock("../../network", () => ({ fetchWithProxy: vi.fn() }));

test("fetches a bounded public page and uses pagination without following supplied URLs", async () => {
  vi.mocked(fetchWithProxy).mockResolvedValueOnce(
    new Response(
      JSON.stringify([
        { full_name: "owner/repo", private: false, topics: ["typescript"] },
      ]),
      { headers: { link: '<https://untrusted.example/>; rel="next"' } },
    ),
  );
  const page = await readStarredPage("octocat", 2);
  expect(page.hasNext).toBe(true);
  expect(page.repositories[0].full_name).toBe("owner/repo");
  expect(fetchWithProxy).toHaveBeenLastCalledWith(
    "https://api.github.com/users/octocat/starred?sort=created&direction=desc&per_page=100&page=2",
    expect.objectContaining({ redirect: "error", size: 5 * 1024 * 1024 }),
  );
});

test("rejects private or malformed repository data", async () => {
  for (const entry of [
    { full_name: "owner/private", private: true },
    { full_name: "../../bad", private: false },
  ]) {
    vi.mocked(fetchWithProxy).mockResolvedValueOnce(
      new Response(JSON.stringify([entry])),
    );
    await expect(readStarredPage("octocat", 1)).rejects.toThrow();
  }
});

test("rate limiting uses a safe message and retry deadline", async () => {
  vi.mocked(fetchWithProxy).mockResolvedValueOnce(
    new Response("do not expose response body", {
      status: 429,
      headers: { "retry-after": "7200" },
    }),
  );
  try {
    await readStarredPage("octocat", 1);
    throw new Error("expected rejection");
  } catch (error) {
    expect(error).toMatchObject({
      message:
        "GitHub rate limit reached. Synchronization will resume automatically.",
    });
    expect((error as { retryAt: Date }).retryAt.getTime()).toBeGreaterThan(
      Date.now() + 7100_000,
    );
  }
});
