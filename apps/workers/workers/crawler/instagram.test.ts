import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("network", () => ({ fetchWithProxy: vi.fn() }));
vi.mock("@karakeep/shared/inference", () => ({
  InferenceClientFactory: { build: vi.fn() },
}));

import { execa } from "execa";
import { fetchWithProxy } from "network";

import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";

import {
  composeInstagramHtml,
  extractInstagramContent,
  isInstagramUrl,
  parseInstagramDump,
  parseVtt,
  privateYtDlpArgs,
  transcribeInstagramAudio,
} from "./instagram";

/** Point InferenceClientFactory at a stub whose transcribeAudio we control. */
function stubTranscriber(impl: (file: string) => Promise<string | null>) {
  const transcribeAudio = vi.fn((_audio: Uint8Array, filename: string) =>
    impl(filename),
  );
  vi.mocked(InferenceClientFactory.build).mockReturnValue({
    transcribeAudio,
  } as unknown as ReturnType<typeof InferenceClientFactory.build>);
  return transcribeAudio;
}

/** Make the mocked yt-dlp drop `files` into the -o directory, then succeed. */
function ytDlpWrites(files: Record<string, string>) {
  vi.mocked(execa).mockImplementation((async (
    _file: string,
    args: string[],
  ) => {
    const outBase = args[args.indexOf("-o") + 1];
    for (const [name, body] of Object.entries(files)) {
      await writeFile(join(dirname(outBase), name), body);
    }
  }) as unknown as typeof execa);
}

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

  it("drops header metadata that yt-dlp writes above the first cue", () => {
    const vtt = [
      "WEBVTT",
      "Kind: captions",
      "Language: en-US",
      "X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000",
      "",
      "00:00:00.000 --> 00:00:02.000",
      "spoken words",
      "",
    ].join("\n");
    expect(parseVtt(vtt)).toBe("spoken words");
  });

  it("drops non-numeric cue identifiers and comment blocks", () => {
    const vtt = [
      "WEBVTT",
      "",
      "NOTE this file was machine generated",
      "",
      "intro",
      "00:00:00.000 --> 00:00:02.000",
      "spoken words",
      "",
      "cue-2",
      "00:00:02.000 --> 00:00:04.000",
      "more words",
      "",
    ].join("\n");
    expect(parseVtt(vtt)).toBe("spoken words more words");
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

describe("parseInstagramDump", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ig-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when there is no info.json", async () => {
    expect(await parseInstagramDump(dir)).toBeNull();
  });

  it("maps info.json fields and folds in the transcript", async () => {
    await writeFile(
      join(dir, "ig.info.json"),
      JSON.stringify({
        description: "my caption",
        uploader: "someuser",
        upload_date: "20260706",
      }),
    );
    await writeFile(
      join(dir, "ig.en.vtt"),
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello\n",
    );
    expect(await parseInstagramDump(dir)).toEqual({
      caption: "my caption",
      transcript: "hello",
      author: "someuser",
      date: "20260706",
    });
  });
});

describe("extractInstagramContent (yt-dlp fallback)", () => {
  const proxy = {
    httpProxy: undefined,
    httpsProxy: undefined,
    noProxy: undefined,
  };
  const signal = new AbortController().signal;

  beforeEach(() => {
    vi.mocked(execa).mockReset();
    // No page data reachable: every case below must go through yt-dlp.
    vi.mocked(fetchWithProxy).mockReset();
    vi.mocked(fetchWithProxy).mockRejectedValue(new Error("offline"));
  });

  it("parses the dump even when yt-dlp exits non-zero", async () => {
    // Image-only carousels error per item ("No video formats found") and a
    // read-only cookie mount fails the cookie-jar save — in both cases yt-dlp
    // exits non-zero yet still wrote a usable info.json. The caption must
    // survive rather than being discarded with the exit code.
    vi.mocked(execa).mockImplementation((async (
      _file: string,
      args: string[],
    ) => {
      const outBase = args[args.indexOf("-o") + 1];
      await writeFile(
        join(dirname(outBase), "ig.info.json"),
        JSON.stringify({
          description: "carousel caption",
          uploader: "someuser",
          upload_date: "20260706",
        }),
      );
      throw new Error("Command failed with exit code 1");
    }) as unknown as typeof execa);

    expect(
      await extractInstagramContent(
        "https://www.instagram.com/p/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toEqual({
      caption: "carousel caption",
      transcript: "",
      author: "someuser",
      date: "20260706",
    });
  });

  it("returns null when yt-dlp fails and left no dump behind", async () => {
    vi.mocked(execa).mockRejectedValue(new Error("network unreachable"));
    expect(
      await extractInstagramContent(
        "https://www.instagram.com/reel/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toBeNull();
  });

  it("refuses non-http(s) URLs without invoking yt-dlp", async () => {
    expect(
      await extractInstagramContent(
        "file:///etc/passwd",
        "job1",
        proxy,
        signal,
      ),
    ).toBeNull();
    expect(execa).not.toHaveBeenCalled();
  });
});

describe("transcribeInstagramAudio", () => {
  const proxy = {
    httpProxy: undefined,
    httpsProxy: undefined,
    noProxy: undefined,
  };
  const signal = new AbortController().signal;

  beforeEach(() => {
    vi.mocked(execa).mockReset();
    vi.mocked(InferenceClientFactory.build).mockReset();
  });

  it("returns nothing when the post had no audio to download", async () => {
    // The image-only carousel case: yt-dlp matches no audio format, writes no
    // file, and the transcriber must never be called (it costs money per call).
    const transcribe = stubTranscriber(async () => "should not happen");
    ytDlpWrites({});
    expect(
      await transcribeInstagramAudio(
        "https://www.instagram.com/p/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toBe("");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("transcribes a single track", async () => {
    stubTranscriber(async () => "spoken words");
    ytDlpWrites({ "NA-ABC123.mp3": "audio" });
    expect(
      await transcribeInstagramAudio(
        "https://www.instagram.com/reel/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toBe("spoken words");
  });

  it("joins tracks of a mixed carousel in item order", async () => {
    // A carousel can hold several videos. They must be concatenated in the
    // order they appear in the post, which is what the playlist_index prefix
    // in the output template gives us once the filenames are sorted.
    stubTranscriber(async (f) => `text of ${f}`);
    ytDlpWrites({
      "2-B.mp3": "audio",
      "10-C.mp3": "audio",
      "1-A.mp3": "audio",
    });
    expect(
      await transcribeInstagramAudio(
        "https://www.instagram.com/p/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toBe("text of 1-A.mp3\n\ntext of 10-C.mp3\n\ntext of 2-B.mp3");
  });

  it("keeps the other tracks when one fails to transcribe", async () => {
    stubTranscriber(async (f) => {
      if (f.startsWith("2-")) {
        throw new Error("rate limited");
      }
      return `text of ${f}`;
    });
    ytDlpWrites({ "1-A.mp3": "audio", "2-B.mp3": "audio" });
    expect(
      await transcribeInstagramAudio(
        "https://www.instagram.com/p/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toBe("text of 1-A.mp3");
  });

  it("still transcribes what downloaded when yt-dlp exits non-zero", async () => {
    // A mixed carousel always exits non-zero: the image items match no audio
    // format. The videos that did download must not be thrown away with it.
    stubTranscriber(async () => "spoken words");
    vi.mocked(execa).mockImplementation((async (
      _file: string,
      args: string[],
    ) => {
      const outBase = args[args.indexOf("-o") + 1];
      await writeFile(join(dirname(outBase), "1-A.mp3"), "audio");
      throw new Error("Command failed with exit code 1");
    }) as unknown as typeof execa);
    expect(
      await transcribeInstagramAudio(
        "https://www.instagram.com/p/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toBe("spoken words");
  });

  it("skips transcription when no inference client is configured", async () => {
    vi.mocked(InferenceClientFactory.build).mockReturnValue(null);
    ytDlpWrites({ "1-A.mp3": "audio" });
    expect(
      await transcribeInstagramAudio(
        "https://www.instagram.com/reel/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toBe("");
    // No point paying for the download either.
    expect(execa).not.toHaveBeenCalled();
  });

  it("caps how long a track may be", async () => {
    stubTranscriber(async () => "spoken words");
    ytDlpWrites({});
    await transcribeInstagramAudio(
      "https://www.instagram.com/reel/ABC123/",
      "job1",
      proxy,
      signal,
    );
    const args = vi.mocked(execa).mock.calls[0][1] as string[];
    expect(args).toContain("--match-filter");
    expect(args[args.indexOf("--match-filter") + 1]).toBe(
      `duration < ${serverConfig.crawler.instagramTranscribeMaxDurationSec}`,
    );
    // The metadata pass pins --no-playlist; this one must not, or the videos
    // inside a carousel are unreachable.
    expect(args).not.toContain("--no-playlist");
  });
});

/** A page carrying one carousel: an image with alt text, a video, a bare image. */
function carouselHtml(): string {
  const payload = {
    items: [
      {
        code: "ABC123",
        media_type: 8,
        taken_at: 1787181237,
        caption: { text: "carousel caption" },
        user: { username: "someuser", full_name: "Some User" },
        image_versions2: { candidates: [{ url: "https://cdn/cover.jpg" }] },
        carousel_media: [
          {
            code: "ABC123",
            media_type: 1,
            accessibility_caption:
              "Photo by Some User on August 19, 2026. May be an image of text",
            image_versions2: { candidates: [{ url: "https://cdn/1.jpg" }] },
          },
          {
            code: "ABC123",
            media_type: 2,
            image_versions2: { candidates: [{ url: "https://cdn/2.jpg" }] },
            video_versions: [{ url: "https://cdn/2.mp4" }],
          },
          {
            code: "ABC123",
            media_type: 1,
            image_versions2: { candidates: [{ url: "https://cdn/3.jpg" }] },
          },
        ],
      },
    ],
  };
  return `<html><script type="application/json" data-sjs>${JSON.stringify(payload)}</script></html>`;
}

/** Route the mocked fetch: the post page, CDN images, CDN video. */
function servePage(html: string) {
  vi.mocked(fetchWithProxy).mockImplementation((async (url: string) => {
    if (url.startsWith("https://www.instagram.com/")) {
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.endsWith(".jpg")) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    }
    if (url.endsWith(".mp4")) {
      return new Response(new Uint8Array([9, 9, 9]), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetchWithProxy);
}

describe("extractInstagramContent (page)", () => {
  const proxy = {
    httpProxy: undefined,
    httpsProxy: undefined,
    noProxy: undefined,
  };
  const signal = new AbortController().signal;
  const saved = { ...serverConfig.crawler };

  beforeEach(() => {
    vi.mocked(execa).mockReset();
    vi.mocked(fetchWithProxy).mockReset();
    vi.mocked(InferenceClientFactory.build).mockReset();
    vi.mocked(InferenceClientFactory.build).mockReturnValue(null);
    serverConfig.crawler.instagramTranscribe = false;
    serverConfig.crawler.instagramDescribeImages = false;
  });

  afterEach(() => {
    Object.assign(serverConfig.crawler, saved);
  });

  it("reads caption, author, date and image alt text without yt-dlp", async () => {
    servePage(carouselHtml());
    expect(
      await extractInstagramContent(
        "https://www.instagram.com/p/ABC123/",
        "job1",
        proxy,
        signal,
      ),
    ).toEqual({
      caption: "carousel caption",
      transcript: "",
      images: ["May be an image of text", ""],
      author: "Some User",
      date: "20260819",
    });
    expect(execa).not.toHaveBeenCalled();
  });

  it("appends OCR text to each image when image description is on", async () => {
    serverConfig.crawler.instagramDescribeImages = true;
    const inferFromImage = vi.fn(async (_p: string, ct: string) => ({
      response: `text in ${ct}`,
      totalTokens: 1,
    }));
    vi.mocked(InferenceClientFactory.build).mockReturnValue({
      inferFromImage,
    } as unknown as ReturnType<typeof InferenceClientFactory.build>);
    servePage(carouselHtml());
    const content = await extractInstagramContent(
      "https://www.instagram.com/p/ABC123/",
      "job1",
      proxy,
      signal,
    );
    expect(content?.images).toEqual([
      "May be an image of text — text in image/jpeg",
      "text in image/jpeg",
    ]);
    // Only the two images were sent to the model, never the video poster.
    expect(inferFromImage).toHaveBeenCalledTimes(2);
  });

  it("caps the number of images sent to the model", async () => {
    serverConfig.crawler.instagramDescribeImages = true;
    serverConfig.crawler.instagramMaxImages = 1;
    const inferFromImage = vi.fn(async () => ({
      response: "ocr",
      totalTokens: 1,
    }));
    vi.mocked(InferenceClientFactory.build).mockReturnValue({
      inferFromImage,
    } as unknown as ReturnType<typeof InferenceClientFactory.build>);
    servePage(carouselHtml());
    const content = await extractInstagramContent(
      "https://www.instagram.com/p/ABC123/",
      "job1",
      proxy,
      signal,
    );
    expect(inferFromImage).toHaveBeenCalledTimes(1);
    // The alt text of the image past the cap is still kept.
    expect(content?.images).toEqual(["May be an image of text — ocr", ""]);
  });

  it("transcribes the videos in the post through ffmpeg, not yt-dlp", async () => {
    serverConfig.crawler.instagramTranscribe = true;
    const transcribeAudio = vi.fn(async () => "spoken words");
    vi.mocked(InferenceClientFactory.build).mockReturnValue({
      transcribeAudio,
    } as unknown as ReturnType<typeof InferenceClientFactory.build>);
    servePage(carouselHtml());
    vi.mocked(execa).mockImplementation((async (
      file: string,
      args: string[],
    ) => {
      expect(file).toBe("ffmpeg");
      await writeFile(args[args.length - 1], "mp3");
    }) as unknown as typeof execa);
    const content = await extractInstagramContent(
      "https://www.instagram.com/p/ABC123/",
      "job1",
      proxy,
      signal,
    );
    expect(content?.transcript).toBe("spoken words");
    expect(execa).toHaveBeenCalledTimes(1);
    const args = vi.mocked(execa).mock.calls[0][1] as string[];
    expect(args[args.indexOf("-t") + 1]).toBe(
      String(serverConfig.crawler.instagramTranscribeMaxDurationSec),
    );
  });

  it("falls back to yt-dlp when the page carries no post data", async () => {
    servePage("<html><body>log in to continue</body></html>");
    vi.mocked(execa).mockImplementation((async (
      _file: string,
      args: string[],
    ) => {
      const outBase = args[args.indexOf("-o") + 1];
      await writeFile(
        join(dirname(outBase), "ig.info.json"),
        JSON.stringify({ description: "from yt-dlp" }),
      );
    }) as unknown as typeof execa);
    const content = await extractInstagramContent(
      "https://www.instagram.com/p/ABC123/",
      "job1",
      proxy,
      signal,
    );
    expect(content?.caption).toBe("from yt-dlp");
    expect(content?.images).toBeUndefined();
  });
});

describe("privateYtDlpArgs", () => {
  const saved = [...serverConfig.crawler.ytDlpArguments];
  let dir: string;
  let jar: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ig-cookies-"));
    jar = join(dir, "master.txt");
    await writeFile(jar, "# Netscape HTTP Cookie File\nsession");
  });

  afterEach(async () => {
    serverConfig.crawler.ytDlpArguments = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it("points yt-dlp at a copy so the configured jar is never rewritten", async () => {
    serverConfig.crawler.ytDlpArguments = ["--cookies", jar, "--verbose"];
    const workDir = await mkdtemp(join(tmpdir(), "ig-work-"));
    try {
      const args = await privateYtDlpArgs(workDir);
      expect(args[0]).toBe("--cookies");
      expect(args[1]).not.toBe(jar);
      expect(dirname(args[1])).toBe(workDir);
      expect(args[2]).toBe("--verbose");
      expect(await readFile(args[1], "utf8")).toBe(await readFile(jar, "utf8"));
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("passes arguments through when there is no cookie jar", async () => {
    serverConfig.crawler.ytDlpArguments = ["--verbose"];
    expect(await privateYtDlpArgs(dir)).toEqual(["--verbose"]);
  });
});
