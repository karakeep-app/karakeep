export const YOUTUBE_TRANSCRIPT_FORMAT = "sentence-v1";

export function getYouTubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId: string | null = null;
    if (host === "youtu.be") {
      videoId = url.pathname.match(/^\/([^/]+)\/?$/)?.[1] ?? null;
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      videoId =
        url.pathname === "/watch"
          ? url.searchParams.get("v")
          : (url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1] ??
            null);
    }
    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export function hasCurrentYouTubeTranscript(html: string): boolean {
  const sections = [
    ...html.matchAll(/<section class="youtube-transcript"[^>]*>/g),
  ];
  return (
    sections.length > 0 &&
    sections.every(([tag]) =>
      tag.includes(`data-transcript-format="${YOUTUBE_TRANSCRIPT_FORMAT}"`),
    )
  );
}

export function removeYouTubeTranscripts(html: string): string {
  return html
    .replace(
      /<section class="youtube-transcript"[^>]*>[\s\S]*?<\/section>\s*/g,
      "",
    )
    .trimEnd();
}
