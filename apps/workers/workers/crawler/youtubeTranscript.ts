import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";

import { YOUTUBE_TRANSCRIPT_FORMAT } from "@karakeep/shared/youtubeTranscript";

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

export class TranslatedCaptionRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslatedCaptionRateLimitError";
  }
}

export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.port) {
      return false;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (
      ((host === "youtube.com" || host === "m.youtube.com") &&
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
  const preferred = [...new Set(preferredLanguages)];
  const safeTrackLanguage = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  const manual = Object.entries(info.subtitles ?? {}).filter(
    ([language, tracks]) =>
      safeTrackLanguage.test(language) &&
      tracks.some((track) => track.ext === "vtt"),
  );
  const manualTrack =
    preferred
      .map((language) => manual.find(([key]) => key === language))
      .find(Boolean) ?? manual[0];
  if (manualTrack) {
    return [
      {
        language: manualTrack[0],
        trackLanguage: manualTrack[0],
        source: "manual",
        translated: false,
      },
    ];
  }

  const automatic = Object.entries(info.automatic_captions ?? {})
    .filter(
      ([language, tracks]) =>
        safeTrackLanguage.test(language) &&
        tracks.some((track) => track.ext === "vtt"),
    )
    .map(([trackLanguage, tracks]) => ({
      trackLanguage,
      language: trackLanguage.replace(/-orig$/, ""),
      source: "automatic" as const,
      translated: tracks.some(
        (track) => track.ext === "vtt" && isTranslatedCaption(track.url),
      ),
    }));
  const original = automatic.filter((track) => !track.translated);
  const originalTrack =
    preferred
      .map((language) =>
        original.find(
          (track) =>
            track.language === language &&
            track.trackLanguage.endsWith("-orig"),
        ),
      )
      .find(Boolean) ??
    preferred
      .map((language) => original.find((track) => track.language === language))
      .find(Boolean) ??
    original.find((track) => track.trackLanguage.endsWith("-orig")) ??
    original[0];
  if (originalTrack) return [originalTrack];

  const translatedTrack = preferred
    .map((language) =>
      automatic.find(
        (track) => track.language === language && track.translated,
      ),
    )
    .find(Boolean);
  return translatedTrack ? [translatedTrack] : [];
}

function isTranslatedCaption(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).searchParams.has("tlang");
  } catch {
    return false;
  }
}

export function exactSubtitleLanguagePattern(language: string): string {
  return `^${language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
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

interface VttCue {
  startMs: number;
  endMs: number;
  lines: string[];
}

interface SpokenLine {
  startMs: number;
  endMs: number;
  raw: string;
  text: string;
  timed: boolean;
  fromTwoLineCue: boolean;
}

const inlineTime = /<(\d{2}:\d{2}:\d{2}\.\d{3})>/g;
const hasInlineTime = /<\d{2}:\d{2}:\d{2}\.\d{3}>/;
const maxUnpunctuatedSegmentDurationMs = 6_000;
const maxPendingSegmentLength = 4_096;
const sentenceTerminal = /[\p{Sentence_Terminal}…]/u;
const noSpaceScripts =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function parseTime(value: string): number | null {
  const match = value.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/);
  if (!match) return null;
  return (
    (Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) *
      1000 +
    Number(match[4])
  );
}

function stripVttTags(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
}

function parseCues(vtt: string): VttCue[] {
  const cues: VttCue[] = [];
  let current: VttCue | undefined;
  // YouTube sometimes puts a whitespace-only line between the cue timing and
  // its text, so splitting on blank lines loses captions.
  for (const rawLine of vtt.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const timing = line.match(/^(.+?)\s+-->\s+(.+)$/);
    if (timing) {
      const startMs = parseTime(timing[1]!);
      const endMs = parseTime(timing[2]!);
      current =
        startMs !== null && endMs !== null
          ? { startMs, endMs, lines: [] }
          : undefined;
      if (current) cues.push(current);
    } else if (current && line && !line.startsWith("NOTE ")) {
      current.lines.push(line);
    }
  }
  return cues;
}

function extractSpokenLines(cues: VttCue[]): SpokenLine[] {
  const lines: SpokenLine[] = [];
  for (const cue of cues) {
    const previous = lines.at(-1);
    const carried =
      cue.lines.length > 1 &&
      stripVttTags(cue.lines[0]!).trim() === previous?.text;
    const candidates = carried ? cue.lines.slice(1) : cue.lines;
    for (const raw of candidates) {
      const text = stripVttTags(raw).trim();
      if (!text) continue;
      const timed = hasInlineTime.test(raw);
      const last = lines.at(-1);
      const adjacent =
        last && cue.startMs >= last.endMs && cue.startMs - last.endMs <= 20;
      // Plain one-line cues immediately after a timed or roll-up line only
      // keep that line visible. Fresh timed lines and new roll-up lines are
      // retained even if the speaker says exactly the same thing again.
      if (
        cue.lines.length === 1 &&
        !timed &&
        adjacent &&
        last.text === text &&
        (last.timed || last.fromTwoLineCue)
      ) {
        continue;
      }
      if (cue.endMs - cue.startMs <= 20 && !timed && last?.text === text) {
        continue;
      }
      lines.push({
        startMs: cue.startMs,
        endMs: cue.endMs,
        raw,
        text,
        timed,
        fromTwoLineCue: carried,
      });
    }
  }
  return lines;
}

function timedFragments(line: SpokenLine): { startMs: number; text: string }[] {
  const fragments: { startMs: number; text: string }[] = [];
  let startMs = line.startMs;
  let cursor = 0;
  for (const match of line.raw.matchAll(inlineTime)) {
    const text = stripVttTags(line.raw.slice(cursor, match.index));
    if (text) fragments.push({ startMs, text });
    startMs = parseTime(match[1]!) ?? startMs;
    cursor = match.index! + match[0].length;
  }
  const text = stripVttTags(line.raw.slice(cursor));
  if (text) fragments.push({ startMs, text });
  return fragments;
}

function splitSentences(
  lines: SpokenLine[],
  language: string,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let sentenceSegmenter: Intl.Segmenter;
  try {
    sentenceSegmenter = new Intl.Segmenter(language, {
      granularity: "sentence",
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    sentenceSegmenter = new Intl.Segmenter("und", {
      granularity: "sentence",
    });
  }
  let text = "";
  let characterStartTimes: number[] = [];
  const emit = (value: string, startMs: number) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized) segments.push({ startMs, text: normalized });
  };
  const flush = () => {
    emit(text, characterStartTimes[0] ?? 0);
    text = "";
    characterStartTimes = [];
  };
  const flushCompleteSentences = () => {
    const rawSentenceParts = [...sentenceSegmenter.segment(text)];
    if (!rawSentenceParts.length) return;
    const sentenceParts: { index: number; segment: string }[] = [];
    for (let index = 0; index < rawSentenceParts.length; index++) {
      const part = rawSentenceParts[index]!;
      let segment = part.segment;
      while (
        /(?:^|\s)\p{Lu}\p{Ll}{0,2}\.$/u.test(segment.trimEnd()) &&
        rawSentenceParts[index + 1] &&
        /^\s*\p{Lu}/u.test(rawSentenceParts[index + 1]!.segment)
      ) {
        segment += rawSentenceParts[++index]!.segment;
      }
      sentenceParts.push({ index: part.index, segment });
    }
    const lastSentenceIsComplete =
      /[\p{Sentence_Terminal}…][」』】）)\]}"'’”]*$/u.test(text.trimEnd());
    let completeParts = lastSentenceIsComplete
      ? sentenceParts.length
      : sentenceParts.length - 1;
    if (
      /(?:^|\s)\p{Lu}\p{Ll}{0,2}\.$/u.test(
        sentenceParts.at(-1)!.segment.trimEnd(),
      )
    ) {
      completeParts = Math.min(completeParts, sentenceParts.length - 1);
    }
    if (completeParts <= 0) return;
    const completed = sentenceParts.slice(0, completeParts);
    const consumed = completed.reduce(
      (length, part) => length + part.segment.length,
      0,
    );
    for (const part of completed) {
      emit(part.segment, characterStartTimes[part.index] ?? 0);
    }
    text = text.slice(consumed);
    characterStartTimes = characterStartTimes.slice(consumed);
  };
  for (const line of lines) {
    const nonSpeech = /^\[[^\]]+\]$/.test(line.text);
    if (nonSpeech) flush();
    for (const fragment of timedFragments(line)) {
      const leadingTerminal = fragment.text.match(
        /^\s*([\p{Sentence_Terminal}…]+)/u,
      )?.[1];
      if (
        !text &&
        leadingTerminal &&
        /^[\s\p{Sentence_Terminal}…]+$/u.test(fragment.text) &&
        segments.length
      ) {
        segments.at(-1)!.text += leadingTerminal;
        continue;
      }
      const previousCharacter = text.at(-1) ?? "";
      const firstCharacter = fragment.text.match(/\S/u)?.[0];
      if (
        text &&
        previousCharacter &&
        firstCharacter &&
        !/^\s/u.test(fragment.text) &&
        /[\p{L}\p{N}]$/u.test(previousCharacter) &&
        /^[\p{L}\p{N}]/u.test(firstCharacter) &&
        !noSpaceScripts.test(`${previousCharacter}${firstCharacter}`)
      ) {
        text += " ";
        characterStartTimes.push(fragment.startMs);
      }
      for (const character of fragment.text) {
        if (!text && !character.trim()) continue;
        text += character;
        characterStartTimes.push(fragment.startMs);
        if (character.length === 2) characterStartTimes.push(fragment.startMs);
      }
      // Sentence segmentation examines the whole pending text. Run it only
      // when new punctuation can introduce a boundary.
      if (sentenceTerminal.test(fragment.text)) flushCompleteSentences();
      if (text.length >= maxPendingSegmentLength) flush();
    }
    if (
      text &&
      line.endMs - (characterStartTimes[0] ?? line.endMs) >=
        maxUnpunctuatedSegmentDurationMs
    ) {
      flush();
    }
    if (nonSpeech) flush();
  }
  flush();
  for (let index = 0; index < segments.length - 1; index++) {
    segments[index]!.durationMs = Math.max(
      0,
      segments[index + 1]!.startMs - segments[index]!.startMs,
    );
  }
  return segments;
}

export function parseVtt(
  vtt: string,
  source: "manual" | "automatic",
  language = "und",
): TranscriptSegment[] {
  const cues = parseCues(vtt);
  const rollup =
    source === "automatic" &&
    cues.some((cue) => cue.lines.some((line) => hasInlineTime.test(line))) &&
    cues.some((cue) => cue.endMs - cue.startMs <= 20);
  if (!rollup) {
    return cues
      .map((cue) => ({
        startMs: cue.startMs,
        durationMs: Math.max(0, cue.endMs - cue.startMs),
        text: stripVttTags(cue.lines.join(" ")).trim(),
      }))
      .filter((segment) => segment.text);
  }
  return splitSentences(extractSpokenLines(cues), language);
}

export function transcriptToHtml(
  transcripts: YouTubeTranscript[],
  videoUrl: string,
): string {
  if (!isYouTubeUrl(videoUrl)) {
    throw new Error("Expected a YouTube video URL");
  }
  const timestampUrl = new URL(videoUrl);
  return transcripts
    .map((transcript) => {
      const body = transcript.segments
        .map((segment) => {
          const seconds = Math.floor(segment.startMs / 1000);
          timestampUrl.searchParams.set("t", `${seconds}s`);
          return `<p class="youtube-transcript-segment" data-start-ms="${segment.startMs}"><a class="youtube-transcript-timestamp" href="${escapeHtml(timestampUrl.toString())}">${formatTimestamp(seconds)}</a> ${escapeHtml(segment.text)}</p>`;
        })
        .join("\n");
      return `<section class="youtube-transcript" data-transcript-format="${YOUTUBE_TRANSCRIPT_FORMAT}" data-transcript-language="${escapeHtml(transcript.language)}" data-transcript-source="${transcript.source}"><h2>Transcript (${escapeHtml(transcript.language)})</h2>\n${body}\n</section>`;
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
    const selection = selected[0]!;
    const infoPath = path.join(directory, "video.info.json");
    await fs.writeFile(infoPath, stdout);
    const args = [
      ...proxyArgs,
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
      const detail =
        error instanceof Error &&
        "stderr" in error &&
        typeof error.stderr === "string"
          ? error.stderr
          : String(error);
      if (
        selection.translated &&
        /HTTP Error 429|Too Many Requests/i.test(detail)
      ) {
        throw new TranslatedCaptionRateLimitError(detail);
      }
      throw error;
    }
    const files = await fs.readdir(directory);
    const transcripts: YouTubeTranscript[] = [];
    const subtitle = files.find((file) =>
      file.endsWith(`.${selection.trackLanguage}.vtt`),
    );
    if (subtitle) {
      const segments = parseVtt(
        await fs.readFile(path.join(directory, subtitle), "utf8"),
        selection.source,
        selection.language,
      );
      if (segments.length) transcripts.push({ ...selection, segments });
    }
    return transcripts;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
