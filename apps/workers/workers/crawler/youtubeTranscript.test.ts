import { describe, expect, it } from "vitest";

import { selectLanguages, transcriptToHtml } from "./youtubeTranscript";

describe("selectLanguages", () => {
  it("selects one preferred manual track instead of an auto-translation", () => {
    const selected = selectLanguages(
      {
        subtitles: {
          en: [
            {
              ext: "vtt",
              url: "https://www.youtube.com/api/timedtext?lang=en",
            },
          ],
        },
        automatic_captions: {
          ja: [
            {
              ext: "vtt",
              url: "https://www.youtube.com/api/timedtext?lang=en&tlang=ja",
            },
          ],
        },
      },
      ["ja", "en"],
    );

    expect(selected).toEqual([
      {
        language: "en",
        trackLanguage: "en",
        source: "manual",
        translated: false,
      },
    ]);
  });

  it("uses a manual track in another language before any automatic track", () => {
    const selected = selectLanguages(
      {
        subtitles: {
          fr: [
            {
              ext: "vtt",
              url: "https://www.youtube.com/api/timedtext?lang=fr",
            },
          ],
        },
        automatic_captions: {
          ja: [
            {
              ext: "vtt",
              url: "https://www.youtube.com/api/timedtext?lang=en&tlang=ja",
            },
          ],
        },
      },
      ["ja", "en"],
    );

    expect(selected).toEqual([
      {
        language: "fr",
        trackLanguage: "fr",
        source: "manual",
        translated: false,
      },
    ]);
  });

  it("uses the original auto-caption instead of a preferred translated language", () => {
    const selected = selectLanguages(
      {
        automatic_captions: {
          ja: [
            {
              ext: "vtt",
              url: "https://www.youtube.com/api/timedtext?lang=en&tlang=ja",
            },
          ],
          en: [
            {
              ext: "vtt",
              url: "https://www.youtube.com/api/timedtext?lang=en",
            },
          ],
          "en-orig": [
            {
              ext: "vtt",
              url: "https://www.youtube.com/api/timedtext?lang=en",
            },
          ],
        },
      },
      ["ja", "en"],
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

  it("falls back to one translated track only when no manual or original exists", () => {
    expect(
      selectLanguages(
        {
          automatic_captions: {
            ja: [
              {
                ext: "vtt",
                url: "https://www.youtube.com/api/timedtext?lang=ko&tlang=ja",
              },
            ],
            en: [
              {
                ext: "vtt",
                url: "https://www.youtube.com/api/timedtext?lang=ko&tlang=en",
              },
            ],
          },
        },
        ["ja", "en"],
      ),
    ).toEqual([
      {
        language: "ja",
        trackLanguage: "ja",
        source: "automatic",
        translated: true,
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
