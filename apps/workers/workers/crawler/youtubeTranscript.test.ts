import { describe, expect, it } from "vitest";

import { selectLanguages, transcriptToHtml } from "./youtubeTranscript";

describe("selectLanguages", () => {
  it("prefers the original automatic caption track over a translated track", () => {
    const selected = selectLanguages(
      {
        automatic_captions: {
          en: [
            { url: "https://www.youtube.com/api/timedtext?lang=en&tlang=en" },
          ],
          "en-orig": [{ url: "https://www.youtube.com/api/timedtext?lang=en" }],
        },
      },
      ["en"],
    );

    expect(selected).toEqual([
      {
        language: "en",
        trackLanguage: "en-orig",
        source: "automatic",
        translated: false,
      },
    ]);
  });

  it("marks translated captions as a fallback when no original track exists", () => {
    const selected = selectLanguages(
      {
        automatic_captions: {
          en: [
            { url: "https://www.youtube.com/api/timedtext?lang=ja&tlang=en" },
          ],
        },
      },
      ["en"],
    );

    expect(selected).toEqual([
      {
        language: "en",
        trackLanguage: "en",
        source: "automatic",
        translated: true,
      },
    ]);
  });

  it("prefers manual captions over automatic captions for a configured language", () => {
    const selected = selectLanguages(
      {
        subtitles: {
          ja: [{ url: "https://www.youtube.com/api/timedtext?lang=ja" }],
        },
        automatic_captions: {
          "ja-orig": [{ url: "https://www.youtube.com/api/timedtext?lang=ja" }],
        },
      },
      ["ja"],
    );

    expect(selected).toEqual([
      {
        language: "ja",
        trackLanguage: "ja",
        source: "manual",
        translated: false,
      },
    ]);
  });
});

describe("transcriptToHtml", () => {
  it("preserves timestamps and escapes caption text", () => {
    const html = transcriptToHtml(
      [
        {
          language: "ja",
          source: "automatic",
          segments: [
            {
              startMs: 155000,
              durationMs: 1000,
              text: "<script>alert('x')</script> & hello",
            },
          ],
        },
      ],
      "https://www.youtube.com/watch?v=abc123",
    );

    expect(html).toContain('data-transcript-language="ja"');
    expect(html).toContain('data-transcript-source="automatic"');
    expect(html).toContain('data-start-ms="155000"');
    expect(html).toContain("02:35");
    expect(html).toContain(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; hello",
    );
    expect(html).not.toContain("<script>");
  });

  it("supports timestamps longer than one hour", () => {
    const html = transcriptToHtml(
      [
        {
          language: "en",
          source: "manual",
          segments: [{ startMs: 3_661_000, text: "After an hour" }],
        },
      ],
      "https://youtu.be/abc123",
    );
    expect(html).toContain("01:01:01");
  });

  it("includes multiple configured languages", () => {
    const html = transcriptToHtml(
      [
        {
          language: "ja",
          source: "manual",
          segments: [{ startMs: 0, text: "こんにちは" }],
        },
        {
          language: "en",
          source: "automatic",
          segments: [{ startMs: 0, text: "Hello" }],
        },
      ],
      "https://www.youtube.com/watch?v=abc123",
    );

    expect(html).toContain('data-transcript-language="ja"');
    expect(html).toContain('data-transcript-language="en"');
    expect(html).toContain("こんにちは");
    expect(html).toContain("Hello");
  });
});
