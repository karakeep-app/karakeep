import { describe, expect, it } from "vitest";

import {
  parseVtt,
  selectLanguages,
  transcriptToHtml,
} from "./youtubeTranscript";

describe("parseVtt", () => {
  it("removes roll-up display copies and keeps rapid repeated speech", () => {
    const segments = parseVtt(
      `WEBVTT
Kind: captions
Language: ja

00:00:01.000 --> 00:00:01.500 align:start position:0%
${" "}
はい<00:00:01.250><c>。</c>

00:00:01.500 --> 00:00:01.510 align:start position:0%
はい。

00:00:01.510 --> 00:00:02.000 align:start position:0%
はい。
はい<00:00:01.760><c>。</c>

00:00:02.000 --> 00:00:02.010 align:start position:0%
はい。

00:00:02.010 --> 00:00:02.500 align:start position:0%
はい。
はい。

00:00:02.500 --> 00:00:03.000 align:start position:0%
はい。
`,
      "automatic",
    );
    expect(segments.map(({ startMs, text }) => ({ startMs, text }))).toEqual([
      { startMs: 1000, text: "はい。" },
      { startMs: 1510, text: "はい。" },
      { startMs: 2010, text: "はい。" },
    ]);
  });

  it("uses inline timing for the next sentence and preserves its text", () => {
    const segments = parseVtt(
      `WEBVTT

00:00:00.960 --> 00:00:03.350
${" "}
ロボット<00:00:01.695><c>の皆さん。 </c><00:00:01.842><c>もう</c><00:00:02.100><c>一度試します。</c>

00:00:03.350 --> 00:00:03.360
ロボットの皆さん。 もう一度試します。
`,
      "automatic",
    );
    expect(segments.map(({ startMs, text }) => ({ startMs, text }))).toEqual([
      { startMs: 960, text: "ロボットの皆さん。" },
      { startMs: 1842, text: "もう一度試します。" },
    ]);
  });

  it("starts an unpunctuated English sentence at its timed word", () => {
    const segments = parseVtt(
      `WEBVTT

00:01:03.300 --> 00:01:06.770
inside<00:01:04.199><c> the</c><00:01:04.559><c> motor</c><00:01:05.000><c> While</c><00:01:06.000><c> most</c><00:01:06.360><c> Motors</c>

00:01:06.770 --> 00:01:06.780
inside the motor While most Motors
`,
      "automatic",
    );
    expect(segments.map(({ startMs, text }) => ({ startMs, text }))).toEqual([
      { startMs: 63300, text: "inside the motor" },
      { startMs: 65000, text: "While most Motors" },
    ]);
  });

  it("keeps ordinary manual captions", () => {
    const segments = parseVtt(
      `WEBVTT

00:00:01.000 --> 00:00:02.000
First line
Second line
`,
      "manual",
    );
    expect(segments).toEqual([
      { startMs: 1000, durationMs: 1000, text: "First line Second line" },
    ]);
  });
});

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
    expect(html).toContain('data-transcript-format="sentence-v1"');
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
