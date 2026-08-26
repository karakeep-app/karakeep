import { fetchWithProxy } from "network";
import type { RunProxyConfig } from "network";

export async function fetchYouTubeAuthor(
  url: string,
  abortSignal: AbortSignal,
  runProxy: RunProxyConfig,
): Promise<string | null> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (
    parsedUrl.hostname !== "youtube.com" &&
    !parsedUrl.hostname.endsWith(".youtube.com") &&
    parsedUrl.hostname !== "youtu.be"
  ) {
    return null;
  }

  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", parsedUrl.toString());
  endpoint.searchParams.set("format", "json");

  try {
    const response = await fetchWithProxy(
      endpoint.toString(),
      {
        signal: AbortSignal.any([AbortSignal.timeout(5_000), abortSignal]),
      },
      runProxy,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { author_name?: unknown };
    return typeof data.author_name === "string"
      ? data.author_name.trim() || null
      : null;
  } catch {
    return null;
  }
}
