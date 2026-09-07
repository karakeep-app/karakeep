import {
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { execa } from "execa";
import type { RunProxyConfig } from "network";
import { fetchWithProxy } from "network";

import { db } from "@karakeep/db";
import { bookmarkLinks } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import type { InferenceClient } from "@karakeep/shared/inference";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { buildOCRPrompt } from "@karakeep/shared/prompts";

import type { InstagramMediaItem } from "./instagramPage";
import {
  fetchInstagramPage,
  InstagramTransientError,
  parseInstagramPage,
} from "./instagramPage";

const INSTAGRAM_MEDIA_TYPES = new Set(["p", "reel", "reels", "tv"]);

export interface InstagramExtractionStats {
  path: "page" | "ytdlp";
  images: { expected: number; got: number };
  videos: { expected: number; got: number };
}

export interface InstagramContent {
  caption: string;
  transcript: string;
  /**
   * One entry per image in the post, in order: Instagram's alt text plus any
   * OCR'd text. Empty string for an image that yielded nothing. Absent on the
   * yt-dlp fallback path, which cannot see images at all.
   */
  images?: string[];
  author: string | null;
  date: string | null;
  /** Absent on the yt-dlp fallback path, which cannot count what it did not see. */
  stats?: InstagramExtractionStats;
}

export function extractionStatus(
  stats: InstagramExtractionStats,
): "ok" | "partial" {
  return stats.images.got < stats.images.expected ||
    stats.videos.got < stats.videos.expected
    ? "partial"
    : "ok";
}

/**
 * Machine-readable trailer for htmlContent. The homelab health probe greps
 * this to count partial extractions; it is an HTML comment so the UI never
 * shows it and the search index ignores it.
 */
export function instagramMarker(stats: InstagramExtractionStats): string {
  return `<!-- karakeep-ig path=${stats.path} images=${stats.images.got}/${stats.images.expected} videos=${stats.videos.got}/${stats.videos.expected} status=${extractionStatus(stats)} -->`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function composeInstagramHtml(content: InstagramContent): string {
  const parts: string[] = [];
  if (content.caption) {
    parts.push(`<p>${escapeHtml(content.caption)}</p>`);
  }
  if (content.transcript) {
    parts.push(`<h2>Transcript</h2>`);
    parts.push(`<p>${escapeHtml(content.transcript)}</p>`);
  }
  const images = (content.images ?? [])
    .map((text, i) => ({ n: i + 1, text }))
    .filter(({ text }) => text);
  if (images.length > 0) {
    parts.push(`<h2>Images</h2>`);
    for (const { n, text } of images) {
      parts.push(`<p>[${n}] ${escapeHtml(text)}</p>`);
    }
  }
  const footer = [content.author, content.date].filter(Boolean).join(" · ");
  if (footer) {
    parts.push(`<p><small>${escapeHtml(footer)}</small></p>`);
  }
  if (content.stats) {
    parts.push(instagramMarker(content.stats));
  }
  return parts.join("\n");
}

export function isInstagramUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!/(^|\.)instagram\.com$/.test(parsed.hostname)) {
    return false;
  }
  const [type, shortcode] = parsed.pathname.split("/").filter(Boolean);
  return !!shortcode && INSTAGRAM_MEDIA_TYPES.has(type);
}

/**
 * Extract the spoken text out of a WebVTT file.
 *
 * Only the lines that follow a timestamp line carry payload. Everything else
 * is structure: the header block (`WEBVTT`, `Kind: captions`, `Language:`,
 * `X-TIMESTAMP-MAP=...`), `NOTE`/`STYLE`/`REGION` blocks, and the optional cue
 * identifier that may precede a timestamp (the spec allows any non-empty
 * string there, not just an index). Tracking whether we are inside a cue drops
 * all of those without having to enumerate them.
 */
export function parseVtt(vtt: string): string {
  const out: string[] = [];
  let inCue = false;
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      inCue = false; // a blank line terminates the current block
      continue;
    }
    if (line.includes("-->")) {
      inCue = true; // timestamp line; its payload is on the lines below
      continue;
    }
    if (!inCue) continue; // header, comment block, or cue identifier
    if (line === out[out.length - 1]) continue; // consecutive duplicate
    out.push(line);
  }
  return out.join(" ");
}

export async function parseInstagramDump(
  dir: string,
): Promise<InstagramContent | null> {
  const files = await readdir(dir);
  const infoName = files.find((f) => f.endsWith(".info.json"));
  if (!infoName) {
    return null;
  }
  const info = JSON.parse(await readFile(join(dir, infoName), "utf8")) as {
    description?: string;
    uploader?: string;
    channel?: string;
    upload_date?: string;
    duration?: number;
  };

  const vttName = files.find((f) => f.endsWith(".vtt"));
  const transcript = vttName
    ? parseVtt(await readFile(join(dir, vttName), "utf8"))
    : "";

  return {
    caption: info.description ?? "",
    transcript,
    author: info.uploader ?? info.channel ?? null,
    date: info.upload_date ?? null,
  };
}

/**
 * yt-dlp rewrites the cookie jar it is given when it exits, and Instagram's
 * response to a burst of requests can be a Set-Cookie that drops the session
 * — after which the jar on disk is logged out for good. Hand yt-dlp a private
 * copy inside the job's temp dir instead, so the configured jar is only ever
 * read. Any `--cookies <path>` in CRAWLER_YTDLP_ARGS is redirected; other
 * arguments pass through untouched.
 */
export async function privateYtDlpArgs(dir: string): Promise<string[]> {
  const args = [...serverConfig.crawler.ytDlpArguments];
  const i = args.indexOf("--cookies");
  if (i === -1 || i + 1 >= args.length) {
    return args;
  }
  const copy = join(dir, "cookies.txt");
  try {
    await copyFile(args[i + 1], copy);
    args[i + 1] = copy;
  } catch (e) {
    // A missing or unreadable jar is a configuration problem yt-dlp will
    // report on its own; don't mask it by silently running without cookies.
    logger.warn(`[Crawler] Could not copy the yt-dlp cookie jar: ${e}`);
  }
  return args;
}

async function transcribeAudioFile(
  client: InferenceClient,
  path: string,
  name: string,
): Promise<string | null> {
  const audio = await readFile(path);
  return await client.transcribeAudio(audio, name);
}

/**
 * Pull the audio of every video in an Instagram post via yt-dlp and
 * transcribe it. This is the fallback path, used when the page could not be
 * read directly.
 *
 * Unlike the metadata pass this one deliberately omits `--no-playlist`: a
 * carousel can mix images and videos, and the videos in it have to be reached.
 * yt-dlp's format selector is the gate — an image item matches no audio format
 * and is skipped, so an image-only carousel downloads nothing and costs
 * nothing. `--match-filter` caps duration per item, which also covers the
 * playlist case where the top-level metadata carries no duration at all.
 *
 * Returns the transcripts joined in item order, or "" when there was no audio
 * (the common case: image-only posts).
 */
export async function transcribeInstagramAudio(
  url: string,
  jobId: string,
  runProxy: RunProxyConfig,
  abortSignal: AbortSignal,
): Promise<{ transcript: string; transcribed: number }> {
  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.info(
      `[Crawler][${jobId}] No inference client configured; skipping Instagram transcription`,
    );
    return { transcript: "", transcribed: 0 };
  }
  const maxDuration = serverConfig.crawler.instagramTranscribeMaxDurationSec;
  const dir = await mkdtemp(join(tmpdir(), "karakeep-ig-audio-"));
  try {
    const proxy = runProxy.httpsProxy ?? runProxy.httpProxy;
    const args = [
      "-f",
      "bestaudio",
      "-x",
      "--audio-format",
      "mp3",
      // Keep going past items that carry no audio instead of aborting the run.
      "--ignore-errors",
      "--match-filter",
      `duration < ${maxDuration}`,
      // playlist_index is "NA" for a standalone reel, so the id keeps names
      // unique and sorting them reproduces the order items appear in the post.
      "-o",
      join(dir, "%(playlist_index)s-%(id)s.%(ext)s"),
      ...(await privateYtDlpArgs(dir)),
      ...(proxy ? ["--proxy", proxy] : []),
      "--",
      url,
    ];
    try {
      await execa("yt-dlp", args, {
        cancelSignal: abortSignal,
        timeout: serverConfig.crawler.downloadVideoTimeout * 1000,
      });
    } catch (e) {
      // Same salvage rationale as the metadata pass: yt-dlp exits non-zero
      // when any item fails (an image in a mixed carousel always does), while
      // still having written the files for the items that worked.
      logger.warn(
        `[Crawler][${jobId}] yt-dlp audio pass exited non-zero for "${url}"; using whatever was downloaded: ${e}`,
      );
    }
    const audioFiles = (await readdir(dir))
      .filter((f) => f.endsWith(".mp3"))
      .sort();
    if (audioFiles.length === 0) {
      return { transcript: "", transcribed: 0 };
    }
    logger.info(
      `[Crawler][${jobId}] Transcribing ${audioFiles.length} audio track(s) for "${url}"`,
    );
    const transcripts: string[] = [];
    for (const file of audioFiles) {
      if (abortSignal.aborted) break;
      try {
        const text = await transcribeAudioFile(
          inferenceClient,
          join(dir, file),
          file,
        );
        if (text) {
          transcripts.push(text);
        }
      } catch (e) {
        // One unreadable track must not cost us the others, nor the caption.
        logger.warn(
          `[Crawler][${jobId}] Failed to transcribe "${file}" of "${url}": ${e}`,
        );
      }
    }
    return {
      transcript: transcripts.join("\n\n"),
      transcribed: transcripts.length,
    };
  } catch (e) {
    logger.warn(
      `[Crawler][${jobId}] Instagram transcription failed for "${url}": ${e}`,
    );
    return { transcript: "", transcribed: 0 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Transcribe videos whose direct URLs the page handed us. No yt-dlp and no
 * cookies: the CDN serves public media to anyone. ffmpeg strips the audio
 * track; `-t` caps the duration so a long video cannot run up the bill.
 */
export async function transcribeInstagramVideos(
  videoUrls: string[],
  jobId: string,
  runProxy: RunProxyConfig,
  abortSignal: AbortSignal,
): Promise<{ transcript: string; transcribed: number }> {
  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.info(
      `[Crawler][${jobId}] No inference client configured; skipping Instagram transcription`,
    );
    return { transcript: "", transcribed: 0 };
  }
  const maxBytes = serverConfig.crawler.maxVideoDownloadSize * 1024 * 1024;
  const maxDuration = serverConfig.crawler.instagramTranscribeMaxDurationSec;
  const dir = await mkdtemp(join(tmpdir(), "karakeep-ig-video-"));
  try {
    logger.info(
      `[Crawler][${jobId}] Transcribing ${videoUrls.length} video(s) directly`,
    );
    const transcripts: string[] = [];
    for (const [i, videoUrl] of videoUrls.entries()) {
      if (abortSignal.aborted) break;
      try {
        const response = await fetchWithProxy(
          videoUrl,
          {
            signal: AbortSignal.any([
              AbortSignal.timeout(
                serverConfig.crawler.downloadVideoTimeout * 1000,
              ),
              abortSignal,
            ]),
          },
          runProxy,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const video = Buffer.from(await response.arrayBuffer());
        if (video.byteLength > maxBytes) {
          logger.warn(
            `[Crawler][${jobId}] Video ${i + 1} is ${video.byteLength} bytes, over the ${maxBytes} limit; skipping`,
          );
          continue;
        }
        const mp4 = join(dir, `${i}.mp4`);
        const mp3 = join(dir, `${i}.mp3`);
        await writeFile(mp4, video);
        await execa(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            mp4,
            "-vn",
            "-acodec",
            "libmp3lame",
            "-q:a",
            "5",
            "-t",
            String(maxDuration),
            mp3,
          ],
          { cancelSignal: abortSignal, timeout: 120_000 },
        );
        const text = await transcribeAudioFile(
          inferenceClient,
          mp3,
          "audio.mp3",
        );
        if (text) {
          transcripts.push(text);
        }
      } catch (e) {
        // One bad video must not cost us the others, nor the caption.
        logger.warn(
          `[Crawler][${jobId}] Failed to transcribe video ${i + 1}: ${e}`,
        );
      }
    }
    return {
      transcript: transcripts.join("\n\n"),
      transcribed: transcripts.length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Turn each image into indexable text. Instagram's alt text comes for free
 * and already names what is in the picture (and often quotes its text); when
 * image description is enabled, the image is also run through the same LLM
 * OCR prompt the asset pipeline uses, which recovers the full text of the
 * slide-style posts people actually save.
 *
 * Returns one string per image, in order; empty when nothing was obtained.
 */
export async function describeInstagramImages(
  images: InstagramMediaItem[],
  jobId: string,
  runProxy: RunProxyConfig,
  abortSignal: AbortSignal,
): Promise<string[]> {
  const inferenceClient = serverConfig.crawler.instagramDescribeImages
    ? InferenceClientFactory.build()
    : null;
  const max = serverConfig.crawler.instagramMaxImages;
  if (images.length > max) {
    logger.info(
      `[Crawler][${jobId}] Post has ${images.length} images; describing the first ${max}`,
    );
  }
  const out: string[] = [];
  for (const [i, image] of images.entries()) {
    if (abortSignal.aborted) {
      // Out of time: keep what we have and pad the rest so indices still
      // line up. Alt text came with the page and costs nothing, so keep it
      // for the images we never got to OCR.
      out.push(...images.slice(i).map((img) => img.altText ?? ""));
      break;
    }
    const pieces: string[] = [];
    if (image.altText) {
      pieces.push(image.altText);
    }
    if (inferenceClient && image.imageUrl && i < max) {
      try {
        const response = await fetchWithProxy(
          image.imageUrl,
          {
            signal: AbortSignal.any([AbortSignal.timeout(20_000), abortSignal]),
          },
          runProxy,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const contentType =
          response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
        const base64 = Buffer.from(await response.arrayBuffer()).toString(
          "base64",
        );
        const ocr = await inferenceClient.inferFromImage(
          buildOCRPrompt(),
          contentType,
          base64,
          { schema: null, abortSignal },
        );
        const text = ocr.response.trim();
        if (text) {
          pieces.push(text);
        }
      } catch (e) {
        // Keep the alt text; losing one image's OCR is not worth the post.
        logger.warn(
          `[Crawler][${jobId}] Failed to describe image ${i + 1}: ${e}`,
        );
      }
    }
    out.push(pieces.join(" — "));
  }
  return out;
}

/**
 * Read the post straight from Instagram's page: caption, author, date, and
 * every image and video in it. This is the primary path. It needs no cookies
 * for public posts, and it is the only path that can see carousel images.
 */
async function extractFromPage(
  url: string,
  jobId: string,
  runProxy: RunProxyConfig,
  abortSignal: AbortSignal,
): Promise<InstagramContent | null> {
  const html = await fetchInstagramPage(url, jobId, runProxy, abortSignal);
  if (!html) {
    return null;
  }
  const media = parseInstagramPage(html);
  if (!media) {
    logger.warn(
      `[Crawler][${jobId}] Instagram page for "${url}" carried no post data`,
    );
    return null;
  }
  const videos = media.items.filter((i) => i.kind === "video" && i.videoUrl);
  const images = media.items.filter((i) => i.kind === "image" && i.imageUrl);
  logger.info(
    `[Crawler][${jobId}] Read Instagram post ${media.code} from its page: ${images.length} image(s), ${videos.length} video(s)`,
  );
  let video =
    serverConfig.crawler.instagramTranscribe && videos.length > 0
      ? await transcribeInstagramVideos(
          videos.map((v) => v.videoUrl!),
          jobId,
          runProxy,
          abortSignal,
        )
      : { transcript: "", transcribed: 0 };
  // Some posts expose a video-only track in video_versions (audio is a
  // separate DASH stream), so ffmpeg finds nothing to transcribe. yt-dlp's
  // bestaudio selector reaches that separate track, anonymously.
  if (
    serverConfig.crawler.instagramTranscribe &&
    !abortSignal.aborted &&
    video.transcribed < videos.length
  ) {
    logger.info(
      `[Crawler][${jobId}] ${videos.length - video.transcribed} video(s) yielded no transcript; retrying via yt-dlp audio`,
    );
    const viaYtDlp = await transcribeInstagramAudio(
      url,
      jobId,
      runProxy,
      abortSignal,
    );
    if (
      viaYtDlp.transcript &&
      viaYtDlp.transcript.length > video.transcript.length
    ) {
      video = viaYtDlp;
    }
  }
  const imageTexts =
    images.length > 0
      ? await describeInstagramImages(images, jobId, runProxy, abortSignal)
      : [];
  return {
    caption: media.caption,
    transcript: video.transcript,
    images: imageTexts,
    author: media.author,
    date: media.date,
    stats: {
      path: "page",
      images: {
        expected: images.length,
        got: imageTexts.filter(Boolean).length,
      },
      videos: { expected: videos.length, got: video.transcribed },
    },
  };
}

/**
 * Fallback: metadata via yt-dlp. Kept for the day Instagram stops serving
 * post data to anonymous page requests; with a cookie jar configured this
 * path can still read what the page cannot.
 */
async function extractWithYtDlp(
  url: string,
  jobId: string,
  runProxy: RunProxyConfig,
  abortSignal: AbortSignal,
): Promise<InstagramContent | null> {
  const dir = await mkdtemp(join(tmpdir(), "karakeep-ig-"));
  try {
    const proxy = runProxy.httpsProxy ?? runProxy.httpProxy;
    const args = [
      "--skip-download",
      "--write-info-json",
      "--write-auto-subs",
      "--sub-langs",
      "en.*",
      "--convert-subs",
      "vtt",
      "--no-playlist",
      "-o",
      join(dir, "ig"),
      ...(await privateYtDlpArgs(dir)),
      ...(proxy ? ["--proxy", proxy] : []),
      "--",
      url,
    ];
    logger.info(
      `[Crawler][${jobId}] Extracting Instagram content for "${url}" via yt-dlp`,
    );
    try {
      await execa("yt-dlp", args, {
        cancelSignal: abortSignal,
        timeout: 60_000,
      });
    } catch (e) {
      // yt-dlp exits non-zero in cases where it still wrote a usable
      // info.json: image-only carousels error per item ("No video formats
      // found"), and saving the cookie jar fails on a read-only mount. Parse
      // whatever landed on disk instead of discarding it with the exit code.
      logger.warn(
        `[Crawler][${jobId}] yt-dlp exited non-zero for "${url}"; parsing any partial output: ${e}`,
      );
      const stderr = (e as { stderr?: string }).stderr ?? "";
      if (
        /empty media response|not accessible|login required|private/i.test(
          stderr,
        )
      ) {
        logger.info(
          `[Crawler][${jobId}] "${url}" is not public; nothing to extract without a session`,
        );
        return null; // permanent: do not retry
      }
      if (
        /Failed to parse JSON|HTTP Error 429|HTTP Error 5\d\d|rate.?limit/i.test(
          stderr,
        )
      ) {
        throw new InstagramTransientError(
          `yt-dlp: ${
            stderr.split("\n").find((l) => l.startsWith("ERROR")) ??
            "transient failure"
          }`,
        );
      }
    }
    const content = await parseInstagramDump(dir);
    if (!content) {
      logger.warn(
        `[Crawler][${jobId}] No Instagram content extracted for "${url}"`,
      );
      return content;
    }
    // Instagram never actually serves the auto-subs the metadata pass asks
    // for, so `transcript` is empty here for every post. Falling back to
    // speech-to-text is what makes a reel's spoken words searchable at all;
    // the check still honours a subtitle track if Instagram ever returns one.
    if (!content.transcript && serverConfig.crawler.instagramTranscribe) {
      content.transcript = (
        await transcribeInstagramAudio(url, jobId, runProxy, abortSignal)
      ).transcript;
    }
    return content;
  } catch (e) {
    if (e instanceof InstagramTransientError) throw e;
    logger.warn(
      `[Crawler][${jobId}] Instagram extraction failed for "${url}": ${e}`,
    );
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function extractInstagramContent(
  url: string,
  jobId: string,
  runProxy: RunProxyConfig,
  abortSignal: AbortSignal,
): Promise<InstagramContent | null> {
  if (!/^https?:\/\//i.test(url)) {
    logger.warn(
      `[Crawler][${jobId}] Refusing non-http(s) Instagram URL "${url}"`,
    );
    return null;
  }
  try {
    const fromPage = await extractFromPage(url, jobId, runProxy, abortSignal);
    if (fromPage) {
      return fromPage;
    }
  } catch (e) {
    if (e instanceof InstagramTransientError) throw e;
    if (abortSignal.aborted) {
      logger.warn(
        `[Crawler][${jobId}] Instagram extraction for "${url}" aborted: ${e}`,
      );
      return null;
    }
    logger.warn(
      `[Crawler][${jobId}] Reading the Instagram page for "${url}" failed: ${e}`,
    );
  }
  logger.info(`[Crawler][${jobId}] Falling back to yt-dlp for "${url}"`);
  return await extractWithYtDlp(url, jobId, runProxy, abortSignal);
}

export async function handleInstagramBookmark(args: {
  url: string;
  jobId: string;
  bookmarkId: string;
  runProxy: RunProxyConfig;
  abortSignal: AbortSignal;
}): Promise<boolean> {
  const { url, jobId, bookmarkId, runProxy, abortSignal } = args;
  const content = await extractInstagramContent(
    url,
    jobId,
    runProxy,
    abortSignal,
  );
  if (!content) {
    logger.warn(
      `[Crawler][${jobId}] No Instagram content extracted for "${url}"; leaving bookmark as-is`,
    );
    return false;
  }
  // A transcript-only reel has no caption, and a slide deck may have neither.
  // Only set the columns we have a value for: passing null would overwrite a
  // title/author stored by an earlier crawl or set by the user.
  const summary =
    content.caption ||
    content.transcript ||
    (content.images ?? []).filter(Boolean).join(" ");
  if (content.stats) {
    const s = content.stats;
    logger.info(
      `[Crawler][${jobId}] [ig] path=${s.path} images=${s.images.got}/${s.images.expected} videos=${s.videos.got}/${s.videos.expected} status=${extractionStatus(s)} url="${url}"`,
    );
  } else {
    logger.info(`[Crawler][${jobId}] [ig] path=ytdlp status=ok url="${url}"`);
  }
  await db
    .update(bookmarkLinks)
    .set({
      htmlContent: composeInstagramHtml(content),
      ...(summary
        ? { title: summary.slice(0, 100), description: summary.slice(0, 300) }
        : {}),
      ...(content.author ? { author: content.author } : {}),
      crawledAt: new Date(),
      crawlStatusCode: 200,
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
  logger.info(`[Crawler][${jobId}] Stored Instagram text content for "${url}"`);
  return true;
}
