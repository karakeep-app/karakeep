import { describe, expect, it } from "vitest";

import { composeInstagramHtml, isInstagramUrl, parseVtt } from "./instagram";

describe("isInstagramUrl", () => {
  it("accepts post, reel, reels and tv URLs", () => {
    expect(isInstagramUrl("https://www.instagram.com/p/ABC123/")).toBe(true);
    expect(isInstagramUrl("https://instagram.com/reel/ABC123/")).toBe(true);
    expect(isInstagramUrl("https://www.instagram.com/reels/ABC123")).toBe(true);
    expect(isInstagramUrl("https://www.instagram.com/tv/ABC123/")).toBe(true);
  });

  it("rejects profile, non-instagram and lookalike hosts", () => {
    expect(isInstagramUrl("https://www.instagram.com/someuser/")).toBe(false);
    expect(isInstagramUrl("https://example.com/p/ABC123/")).toBe(false);
    expect(isInstagramUrl("https://instagram.com.evil.com/p/ABC123/")).toBe(
      false,
    );
    expect(isInstagramUrl("not a url")).toBe(false);
  });
});

describe("parseVtt", () => {
  it("extracts spoken text, dropping timestamps and duplicates", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:02.000",
      "hello world",
      "",
      "00:00:02.000 --> 00:00:04.000",
      "hello world",
      "",
      "00:00:04.000 --> 00:00:06.000",
      "second line",
      "",
    ].join("\n");
    expect(parseVtt(vtt)).toBe("hello world second line");
  });

  it("returns empty string for headerless or empty input", () => {
    expect(parseVtt("")).toBe("");
    expect(parseVtt("WEBVTT\n\n")).toBe("");
  });
});

describe("composeInstagramHtml", () => {
  it("renders caption, transcript and footer, escaping HTML", () => {
    const html = composeInstagramHtml({
      caption: "hi <b>there</b>",
      transcript: "spoken words",
      author: "someuser",
      date: "20260706",
    });
    expect(html).toContain("hi &lt;b&gt;there&lt;/b&gt;");
    expect(html).toContain("<h2>Transcript</h2>");
    expect(html).toContain("spoken words");
    expect(html).toContain("someuser");
    expect(html).toContain("20260706");
  });

  it("omits the transcript section when there is no transcript", () => {
    const html = composeInstagramHtml({
      caption: "just a caption",
      transcript: "",
      author: null,
      date: null,
    });
    expect(html).toContain("just a caption");
    expect(html).not.toContain("<h2>Transcript</h2>");
  });
});
