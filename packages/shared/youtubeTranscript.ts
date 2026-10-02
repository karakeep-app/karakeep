export const YOUTUBE_TRANSCRIPT_FORMAT = "sentence-v1";

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
