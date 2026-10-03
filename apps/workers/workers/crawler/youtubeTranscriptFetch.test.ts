import { beforeEach, describe, expect, it, vi } from "vitest";
import { execa } from "execa";

import {
  fetchYouTubeTranscript,
  TranscriptFetchError,
  TranslatedCaptionRateLimitError,
} from "./youtubeTranscriptFetch";

vi.mock("execa", () => ({ execa: vi.fn() }));

const videoUrl = "https://www.youtube.com/watch?v=abcdefghijk";
const captionInfo = JSON.stringify({
  subtitles: {
    en: [{ ext: "vtt", url: "https://www.youtube.com/api/timedtext" }],
  },
});

describe("fetchYouTubeTranscript failures", () => {
  beforeEach(() => vi.mocked(execa).mockReset());

  it("restricts metadata extraction to one video and redacts sensitive errors", async () => {
    const proxy = "http://user:secret@proxy.example:8080";
    vi.mocked(execa).mockRejectedValueOnce(
      Object.assign(new Error("yt-dlp failed"), {
        stderr: `ERROR: ${proxy} https://youtube.com/watch?v=abcdefghijk&token=secret HTTP Error 403`,
      }),
    );

    const error = await fetchYouTubeTranscript(
      videoUrl,
      ["en"],
      30,
      undefined,
      proxy,
    ).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(TranscriptFetchError);
    expect((error as Error).message).toContain("metadata:");
    expect((error as Error).message).toContain("HTTP Error 403");
    expect((error as Error).message).not.toContain("secret");
    const args = vi.mocked(execa).mock.calls[0]?.[1];
    expect(args).toContain("--no-playlist");
  });

  it("reports a missing VTT file as a download failure", async () => {
    vi.mocked(execa)
      .mockResolvedValueOnce({ stdout: captionInfo } as never)
      .mockResolvedValueOnce({ stdout: "" } as never);

    await expect(fetchYouTubeTranscript(videoUrl, ["en"], 30)).rejects.toThrow(
      "subtitle file: yt-dlp did not create the selected en VTT track",
    );
    expect(vi.mocked(execa).mock.calls[1]?.[1]).toContain("--no-playlist");
  });

  it("preserves translated-caption rate limiting without exposing the proxy", async () => {
    const proxy = "http://user:secret@proxy.example:8080";
    vi.mocked(execa)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          automatic_captions: {
            ja: [
              {
                ext: "vtt",
                url: "https://www.youtube.com/api/timedtext?tlang=ja",
              },
            ],
          },
        }),
      } as never)
      .mockRejectedValueOnce(
        Object.assign(new Error("yt-dlp failed"), {
          stderr: `ERROR: ${proxy} HTTP Error 429`,
        }),
      );

    const error = await fetchYouTubeTranscript(
      videoUrl,
      ["ja"],
      30,
      undefined,
      proxy,
    ).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(TranslatedCaptionRateLimitError);
    expect((error as Error).message).toContain("HTTP Error 429");
    expect((error as Error).message).not.toContain("secret");
  });

  it("treats a video without caption tracks as unavailable", async () => {
    vi.mocked(execa).mockResolvedValueOnce({ stdout: "{}" } as never);
    await expect(fetchYouTubeTranscript(videoUrl, ["en"], 30)).resolves.toEqual(
      [],
    );
  });
});
