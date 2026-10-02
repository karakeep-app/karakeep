import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";

export interface TranscriptSegment {
  startMs: number;
  durationMs?: number;
  text: string;
}

export interface YouTubeTranscript {
  language: string;
  source: "manual" | "automatic";
  segments: TranscriptSegment[];
}

export const TRANSLATED_CAPTION_SLEEP_SEC = 60;

interface YtDlpInfo {
  subtitles?: Record<string, { ext?: string; url?: string }[]>;
  automatic_captions?: Record<string, { ext?: string; url?: string }[]>;
}

export interface SelectedTranscriptLanguage {
  language: string;
  trackLanguage: string;
  source: "manual" | "automatic";
  translated: boolean;
}

export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (
      (host === "youtube.com" &&
        (url.pathname === "/watch" ||
          url.pathname.startsWith("/shorts/") ||
          url.pathname.startsWith("/live/"))) ||
      (host === "youtu.be" && url.pathname.length > 1)
    );
  } catch {
    return false;
  }
}

export function selectLanguages(
  info: YtDlpInfo,
  preferredLanguages: string[],
): SelectedTranscriptLanguage[] {
  const selected: SelectedTranscriptLanguage[] = [];
  for (const language of new Set(preferredLanguages)) {
    if (info.subtitles?.[language]?.length) {
      selected.push({
        language,
        trackLanguage: language,
        source: "manual",
        translated: false,
      });
      continue;
    }

    const automaticCaptions = info.automatic_captions ?? {};
    const available = Object.entries(automaticCaptions).filter(
      ([trackLanguage, tracks]) =>
        tracks.length > 0 &&
        (trackLanguage === language ||
          trackLanguage.startsWith(`${language}-`)),
    );
    const candidates = available.map(([trackLanguage, tracks]) => ({
      language: trackLanguage,
      source: "automatic" as const,
      translated: tracks.some((track) => isTranslatedCaption(track.url)),
      original: trackLanguage === `${language}-orig`,
    }));

    // YouTube's subtitle track IDs changed: for example, `en` may now refer
    // to an auto-translated track while the spoken-language captions use
    // `en-orig`. Prefer native/manual captions to avoid needless 429s.
    const native = candidates
      .filter((candidate) => !candidate.translated)
      .sort((left, right) => Number(right.original) - Number(left.original))[0];
    const chosen =
      native ?? candidates.find((candidate) => candidate.translated);
    if (chosen) {
      selected.push({
        language,
        trackLanguage: chosen.language,
        source: chosen.source,
        translated: chosen.translated,
      });
    }
  }
  return selected;
}

function isTranslatedCaption(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).searchParams.has("tlang");
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function parseVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = vtt.replace(/^\uFEFF/, "").split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim());
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex]!.split("-->");
    const parseTime = (value: string) => {
      const match = value.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/);
      if (!match) return null;
      return (
        (Number(match[1] ?? 0) * 3600 +
          Number(match[2]) * 60 +
          Number(match[3])) *
          1000 +
        Number(match[4])
      );
    };
    const startMs = parseTime(timing[0] ?? "");
    const endMs = parseTime(timing[1] ?? "");
    const text = lines
      .slice(timingIndex + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (startMs === null || !text) continue;
    segments.push({
      startMs,
      ...(endMs !== null ? { durationMs: Math.max(0, endMs - startMs) } : {}),
      text,
    });
  }
  return segments;
}

export function transcriptToHtml(
  transcripts: YouTubeTranscript[],
  videoUrl: string,
): string {
  const safeVideoUrl = escapeHtml(videoUrl);
  return transcripts
    .map((transcript) => {
      const body = transcript.segments
        .map((segment) => {
          const seconds = Math.floor(segment.startMs / 1000);
          return `<p class="youtube-transcript-segment" data-start-ms="${segment.startMs}"><a class="youtube-transcript-timestamp" href="${safeVideoUrl}&amp;t=${seconds}s">${formatTimestamp(seconds)}</a> ${escapeHtml(segment.text)}</p>`;
        })
        .join("\n");
      return `<section class="youtube-transcript" data-transcript-language="${escapeHtml(transcript.language)}" data-transcript-source="${transcript.source}"><h2>Transcript (${escapeHtml(transcript.language)})</h2>\n${body}\n</section>`;
    })
    .join("\n");
}

export async function fetchYouTubeTranscript(
  videoUrl: string,
  preferredLanguages: string[],
  timeoutSec: number,
  signal?: AbortSignal,
  proxy?: string,
  onTrackSelection?: (summary: string) => void,
): Promise<YouTubeTranscript[]> {
  if (!isYouTubeUrl(videoUrl)) return [];
  const infoTimeout = AbortSignal.timeout(timeoutSec * 1000);
  const infoSignal = signal
    ? AbortSignal.any([signal, infoTimeout])
    : infoTimeout;
  const proxyArgs = proxy ? ["--proxy", proxy] : [];
  const { stdout } = await execa(
    "yt-dlp",
    [...proxyArgs, "--skip-download", "--dump-single-json", videoUrl],
    {
      cancelSignal: infoSignal,
      timeout: timeoutSec * 1000,
      reject: true,
    },
  );
  const info = JSON.parse(stdout) as YtDlpInfo;
  const selected = selectLanguages(info, preferredLanguages);
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
    const languages = selected.map(({ trackLanguage }) => trackLanguage);
    const hasManual = selected.some(({ source }) => source === "manual");
    const hasAutomatic = selected.some(({ source }) => source === "automatic");
    const translatedCount = selected.filter((item) => item.translated).length;
    const subtitleSleepSec =
      translatedCount > 0 ? TRANSLATED_CAPTION_SLEEP_SEC : 0;
    const args = [
      ...proxyArgs,
      "--skip-download",
      "--sub-format",
      "vtt",
      "--sub-langs",
      languages.join(","),
    ];
    if (subtitleSleepSec > 0) {
      args.push("--sleep-subtitles", String(subtitleSleepSec));
    }
    if (hasManual) args.push("--write-subs");
    else args.push("--no-write-subs");
    if (hasAutomatic) args.push("--write-auto-subs");
    else args.push("--no-write-auto-subs");
    args.push("--output", path.join(directory, "%(id)s.%(ext)s"), videoUrl);
    const downloadTimeoutMs =
      (timeoutSec + subtitleSleepSec * translatedCount) * 1000;
    const downloadTimeout = AbortSignal.timeout(downloadTimeoutMs);
    const downloadSignal = signal
      ? AbortSignal.any([signal, downloadTimeout])
      : downloadTimeout;
    await execa("yt-dlp", args, {
      cancelSignal: downloadSignal,
      timeout: downloadTimeoutMs,
    });
    const files = await fs.readdir(directory);
    const transcripts: YouTubeTranscript[] = [];
    for (const selection of selected) {
      const subtitle = files.find((file) =>
        file.endsWith(`.${selection.trackLanguage}.vtt`),
      );
      if (!subtitle) continue;
      const segments = parseVtt(
        await fs.readFile(path.join(directory, subtitle), "utf8"),
      );
      if (segments.length) transcripts.push({ ...selection, segments });
    }
    return transcripts;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
