import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { eq } from "drizzle-orm";
import type { RunProxyConfig } from "network";
import logger from "@karakeep/shared/logger";
import serverConfig from "@karakeep/shared/config";
import { db } from "@karakeep/db";
import { bookmarkLinks } from "@karakeep/db/schema";

const INSTAGRAM_MEDIA_TYPES = new Set(["p", "reel", "reels", "tv"]);

export interface InstagramContent {
  caption: string;
  transcript: string;
  author: string | null;
  date: string | null;
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
  const footer = [content.author, content.date].filter(Boolean).join(" · ");
  if (footer) {
    parts.push(`<p><small>${escapeHtml(footer)}</small></p>`);
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

export function parseVtt(vtt: string): string {
  const out: string[] = [];
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "WEBVTT") continue;
    if (line.includes("-->")) continue; // timestamp cue
    if (/^\d+$/.test(line)) continue; // numeric cue index
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
      ...serverConfig.crawler.ytDlpArguments,
      ...(proxy ? ["--proxy", proxy] : []),
      "--",
      url,
    ];
    logger.info(
      `[Crawler][${jobId}] Extracting Instagram content for "${url}" via yt-dlp`,
    );
    await execa("yt-dlp", args, {
      cancelSignal: abortSignal,
      timeout: 60_000,
    });
    return await parseInstagramDump(dir);
  } catch (e) {
    logger.warn(
      `[Crawler][${jobId}] Instagram extraction failed for "${url}": ${e}`,
    );
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function handleInstagramBookmark(args: {
  url: string;
  jobId: string;
  bookmarkId: string;
  runProxy: RunProxyConfig;
  abortSignal: AbortSignal;
}): Promise<void> {
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
    return;
  }
  await db
    .update(bookmarkLinks)
    .set({
      htmlContent: composeInstagramHtml(content),
      title: content.caption ? content.caption.slice(0, 100) : null,
      description: content.caption ? content.caption.slice(0, 300) : null,
      author: content.author,
      crawledAt: new Date(),
      crawlStatusCode: 200,
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
  logger.info(`[Crawler][${jobId}] Stored Instagram text content for "${url}"`);
}
