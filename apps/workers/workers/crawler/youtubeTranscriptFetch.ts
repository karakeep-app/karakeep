import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";

import {
  exactSubtitleLanguagePattern,
  isYouTubeUrl,
  parseVtt,
  selectLanguages,
} from "./youtubeTranscript";
import type {
  SelectedTranscriptLanguage,
  TranscriptSegment,
  YouTubeTranscript,
  YtDlpInfo,
} from "./youtubeTranscript";

const MAX_METADATA_BYTES = 10 * 1024 * 1024;
const MAX_VTT_BYTES = 10 * 1024 * 1024;

export type TranscriptStage = "metadata" | "download" | "subtitle file";

function safeErrorDetail(error: unknown, proxy?: string): string {
  const stderr =
    error instanceof Error &&
    "stderr" in error &&
    typeof error.stderr === "string"
      ? error.stderr
      : undefined;
  let detail =
    stderr?.trim() || (error instanceof Error ? error.message : String(error));
  if (proxy) detail = detail.replaceAll(proxy, "[redacted proxy]");
  detail = detail.replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      for (const key of url.searchParams.keys()) {
        url.searchParams.set(key, "REDACTED");
      }
      return url.toString();
    } catch {
      return "[redacted URL]";
    }
  });
  return detail.replace(/[\r\n\t]+/g, " ").slice(0, 2_000) || "unknown error";
}

export class TranscriptFetchError extends Error {
  constructor(
    public readonly stage: TranscriptStage,
    error: unknown,
    proxy?: string,
  ) {
    super(`${stage}: ${safeErrorDetail(error, proxy)}`);
    this.name = "TranscriptFetchError";
  }
}

export class TranslatedCaptionRateLimitError extends TranscriptFetchError {
  constructor(message: string) {
    super("download", message);
    this.name = "TranslatedCaptionRateLimitError";
  }
}

export async function fetchYouTubeTranscript(
  videoUrl: string,
  preferredLanguages: string[],
  timeoutSec: number,
  signal?: AbortSignal,
  proxy?: string,
  onTrackSelection?: (summary: string) => void,
): Promise<YouTubeTranscript[]> {
  if (!isYouTubeUrl(videoUrl)) {
    throw new TranscriptFetchError("metadata", "invalid YouTube video URL");
  }
  const infoTimeout = AbortSignal.timeout(timeoutSec * 1000);
  const infoSignal = signal
    ? AbortSignal.any([signal, infoTimeout])
    : infoTimeout;
  const proxyArgs = proxy ? ["--proxy", proxy] : [];
  let stdout: string;
  try {
    ({ stdout } = await execa(
      "yt-dlp",
      [
        ...proxyArgs,
        "--no-playlist",
        "--skip-download",
        "--dump-single-json",
        videoUrl,
      ],
      {
        cancelSignal: infoSignal,
        timeout: timeoutSec * 1000,
        maxBuffer: MAX_METADATA_BYTES,
        reject: true,
      },
    ));
  } catch (error) {
    throw new TranscriptFetchError("metadata", error, proxy);
  }
  let info: YtDlpInfo;
  try {
    info = JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new TranscriptFetchError("metadata", "yt-dlp returned invalid JSON");
  }
  let selected: SelectedTranscriptLanguage[];
  try {
    selected = selectLanguages(info, preferredLanguages);
  } catch {
    throw new TranscriptFetchError(
      "metadata",
      "yt-dlp returned invalid caption metadata",
    );
  }
  if (selected.length === 0) return [];
  onTrackSelection?.(
    selected
      .map(
        (item) =>
          `${item.trackLanguage}/${item.source}/${item.translated ? "translated" : "original"}`,
      )
      .join(", "),
  );

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "youtube-transcript-"),
  );
  try {
    const selection = selected[0]!;
    const infoPath = path.join(directory, "video.info.json");
    await fs.writeFile(infoPath, stdout);
    const args = [
      ...proxyArgs,
      "--no-playlist",
      "--skip-download",
      "--sub-format",
      "vtt",
      "--sub-langs",
      exactSubtitleLanguagePattern(selection.trackLanguage),
    ];
    if (selection.source === "manual") args.push("--write-subs");
    else args.push("--no-write-subs");
    if (selection.source === "automatic") args.push("--write-auto-subs");
    else args.push("--no-write-auto-subs");
    args.push(
      "--output",
      path.join(directory, "%(id)s.%(ext)s"),
      "--load-info-json",
      infoPath,
    );
    const downloadTimeoutMs = timeoutSec * 1000;
    const downloadTimeout = AbortSignal.timeout(downloadTimeoutMs);
    const downloadSignal = signal
      ? AbortSignal.any([signal, downloadTimeout])
      : downloadTimeout;
    try {
      await execa("yt-dlp", args, {
        cancelSignal: downloadSignal,
        timeout: downloadTimeoutMs,
      });
    } catch (error) {
      const detail = new TranscriptFetchError("download", error, proxy);
      if (
        selection.translated &&
        /HTTP Error 429|Too Many Requests/i.test(detail.message)
      ) {
        throw new TranslatedCaptionRateLimitError(
          safeErrorDetail(error, proxy),
        );
      }
      throw detail;
    }
    let files: string[];
    try {
      files = await fs.readdir(directory);
    } catch (error) {
      throw new TranscriptFetchError("subtitle file", error);
    }
    const subtitle = files.find((file) =>
      file.endsWith(`.${selection.trackLanguage}.vtt`),
    );
    if (!subtitle) {
      throw new TranscriptFetchError(
        "subtitle file",
        `yt-dlp did not create the selected ${selection.trackLanguage} VTT track`,
      );
    }
    let segments: TranscriptSegment[];
    try {
      const vttPath = path.join(directory, subtitle);
      if ((await fs.stat(vttPath)).size > MAX_VTT_BYTES) {
        throw new Error("selected VTT track exceeds the 10 MB size limit");
      }
      segments = parseVtt(
        await fs.readFile(vttPath, "utf8"),
        selection.source,
        selection.language,
      );
    } catch (error) {
      throw new TranscriptFetchError("subtitle file", error);
    }
    if (segments.length === 0) {
      throw new TranscriptFetchError(
        "subtitle file",
        "selected VTT track has no captions",
      );
    }
    return [{ ...selection, segments }];
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
