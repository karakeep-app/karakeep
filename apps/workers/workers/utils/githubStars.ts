import { z } from "zod";
import { fetchWithProxy } from "../../network";
import { GithubStarsError } from "@karakeep/trpc/models/githubStars.service";

const repositoriesSchema = z
  .array(
    z.object({
      full_name: z.string().regex(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/),
      topics: z.array(z.string().min(1).max(100)).max(100).default([]),
      private: z.literal(false),
    }),
  )
  .max(100);

export async function readStarredPage(username: string, page: number) {
  const response = await fetchWithProxy(
    `https://api.github.com/users/${encodeURIComponent(username)}/starred?sort=created&direction=desc&per_page=100&page=${page}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Karakeep",
      },
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
      size: 5 * 1024 * 1024,
    },
  );
  if (!response.ok) {
    const cooldown = Math.max(
      60_000,
      Number(response.headers.get("retry-after") ?? 0) * 1000,
      Number(response.headers.get("x-ratelimit-reset") ?? 0) * 1000 -
        Date.now(),
    );
    throw new GithubStarsError(
      response.status === 404
        ? "GitHub user not found. Check the username."
        : response.status === 403 || response.status === 429
          ? "GitHub rate limit reached. Synchronization will resume automatically."
          : "GitHub is unavailable. Synchronization will retry automatically.",
      new Date(
        Date.now() +
          (Number.isFinite(cooldown)
            ? Math.min(Math.max(cooldown, 60 * 60_000), 24 * 60 * 60_000)
            : 60 * 60_000),
      ),
    );
  }
  return {
    repositories: repositoriesSchema.parse(await response.json()),
    hasNext: /rel="next"/.test(response.headers.get("link") ?? ""),
  };
}
