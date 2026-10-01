import { describe, expect, it } from "vitest";

import { transcriptToHtml } from "./youtubeTranscript";

describe("transcriptToHtml", () => {
  it("preserves timestamps and escapes caption text", () => {
    const html = transcriptToHtml(
      {
        language: "ja",
        source: "automatic",
        segments: [{ startMs: 155000, durationMs: 1000, text: "<script>alert('x')</script> & hello" }],
      },
      "https://www.youtube.com/watch?v=abc123",
    );

    expect(html).toContain('data-transcript-language="ja"');
    expect(html).toContain('data-transcript-source="automatic"');
    expect(html).toContain('data-start-ms="155000"');
    expect(html).toContain("02:35");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; hello");
    expect(html).not.toContain("<script>");
  });

  it("supports timestamps longer than one hour", () => {
    const html = transcriptToHtml(
      { language: "en", source: "manual", segments: [{ startMs: 3_661_000, text: "After an hour" }] },
      "https://youtu.be/abc123",
    );
    expect(html).toContain("01:01:01");
  });
});
