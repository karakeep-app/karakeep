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

type YtDlpInfo = {
  subtitles?: Record<string, Array<{ ext?: string; url?: string }>>;
  automatic_captions?: Record<string, Array<{ ext?: string; url?: string }>>;
};

function isYouTubeUrl(value: string): boolean {
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

function selectLanguage(
  info: YtDlpInfo,
  preferredLanguages: string[],
): { language: string; source: "manual" | "automatic" } | null {
  for (const language of preferredLanguages) {
    if (info.subtitles?.[language]?.length) {
      return { language, source: "manual" };
    }
    if (info.automatic_captions?.[language]?.length) {
      return { language, source: "automatic" };
    }
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
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
      return ((Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000) + Number(match[4]);
    };
    const startMs = parseTime(timing[0] ?? "");
    const endMs = parseTime(timing[1] ?? "");
    const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]*>/g, "").trim();
    if (startMs === null || !text) continue;
    segments.push({ startMs, ...(endMs !== null ? { durationMs: Math.max(0, endMs - startMs) } : {}), text });
  }
  return segments;
}

export function transcriptToHtml(
  transcript: YouTubeTranscript,
  videoUrl: string,
): string {
  const safeVideoUrl = escapeHtml(videoUrl);
  const body = transcript.segments.map((segment) => {
    const seconds = Math.floor(segment.startMs / 1000);
    return `<p class="youtube-transcript-segment" data-start-ms="${segment.startMs}"><a class="youtube-transcript-timestamp" href="${safeVideoUrl}&amp;t=${seconds}s">${formatTimestamp(seconds)}</a> ${escapeHtml(segment.text)}</p>`;
  }).join("\n");
  return `<section class="youtube-transcript" data-transcript-language="${escapeHtml(transcript.language)}" data-transcript-source="${transcript.source}"><h2>Transcript</h2>\n${body}\n</section>`;
}

export async function fetchYouTubeTranscript(
  videoUrl: string,
  preferredLanguages: string[],
  timeoutSec: number,
  signal?: AbortSignal,
): Promise<YouTubeTranscript | null> {
  if (!isYouTubeUrl(videoUrl)) return null;
  const timeout = AbortSignal.timeout(timeoutSec * 1000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;
  const { stdout } = await execa("yt-dlp", ["--skip-download", "--dump-single-json", videoUrl], {
    cancelSignal: combinedSignal,
    timeout: timeoutSec * 1000,
    reject: true,
  });
  const info = JSON.parse(stdout) as YtDlpInfo;
  const selected = selectLanguage(info, preferredLanguages);
  if (!selected) return null;

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "youtube-transcript-"));
  try {
    const args = ["--skip-download", "--sub-format", "vtt", "--sub-langs", selected.language];
    if (selected.source === "automatic") {
      args.push("--write-auto-subs");
    } else {
      args.push("--write-subs", "--no-write-auto-subs");
    }
    args.push("--output", path.join(directory, "%(id)s.%(ext)s"), videoUrl);
    await execa("yt-dlp", args, {
      cancelSignal: combinedSignal,
      timeout: timeoutSec * 1000,
    });
    const files = await fs.readdir(directory);
    const subtitle = files.find((file) => file.endsWith(`.${selected.language}.vtt`) || file.endsWith(".vtt"));
    if (!subtitle) return null;
    const segments = parseVtt(await fs.readFile(path.join(directory, subtitle), "utf8"));
    return segments.length ? { ...selected, segments } : null;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
