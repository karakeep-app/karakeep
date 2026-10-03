import { describe, expect, it } from "vitest";

import {
  getYouTubeVideoId,
  hasCurrentYouTubeTranscript,
  removeYouTubeTranscripts,
} from "./youtubeTranscript";

describe("YouTube video URL", () => {
  it.each([
    "https://www.youtube.com/watch?v=abcdefghijk&list=playlist",
    "https://m.youtube.com/shorts/abcdefghijk",
    "https://youtu.be/abcdefghijk?t=10",
    "https://www.youtube.com/embed/abcdefghijk",
  ])("extracts a single video ID from %s", (url) => {
    expect(getYouTubeVideoId(url)).toBe("abcdefghijk");
  });

  it.each([
    "https://www.youtube.com/playlist?list=playlist",
    "https://youtube.com.evil.example/watch?v=abcdefghijk",
    "https://www.youtube.com/watch?list=playlist",
    "https://youtu.be/short",
    "https://user:secret@youtube.com/watch?v=abcdefghijk",
  ])("rejects a non-video URL: %s", (url) => {
    expect(getYouTubeVideoId(url)).toBeNull();
  });
});

describe("YouTube transcript refresh", () => {
  it("treats legacy and mixed-format transcripts as outdated", () => {
    const legacy = '<section class="youtube-transcript">old</section>';
    const current =
      '<section class="youtube-transcript" data-transcript-format="sentence-v1">new</section>';
    expect(hasCurrentYouTubeTranscript(legacy)).toBe(false);
    expect(hasCurrentYouTubeTranscript(current)).toBe(true);
    expect(hasCurrentYouTubeTranscript(legacy + current)).toBe(false);
    expect(
      hasCurrentYouTubeTranscript("<article>no transcript</article>"),
    ).toBe(false);
  });

  it("replaces old transcript sections without removing article content", () => {
    const html =
      '<article>Saved article</article>\n<section class="youtube-transcript" data-transcript-language="en"><p>old caption</p></section>\n<section class="youtube-transcript" data-transcript-language="ja"><p>old Japanese caption</p></section>';
    expect(removeYouTubeTranscripts(html)).toBe(
      "<article>Saved article</article>",
    );
  });
});
