// What the video worker shares with the two VideoDownloader implementations:
// the local one (localVideoDownloader.ts, which runs yt-dlp) and the client of
// a remote sandbox (remoteVideoDownloader.ts). A VideoDownloader does
// everything that talks to the video's website, and nothing that touches the
// database or the asset store.

import fs from "fs";
import * as os from "os";
import path from "path";

import type { RunProxyConfig } from "../../network";

import { ASSET_TYPES } from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";

/** Where the videos are downloaded to before they're saved as assets. */
export const VIDEO_TMP_FOLDER = path.join(os.tmpdir(), "video_downloads");

export interface VideoDownloadRequest {
  jobId: string;
  /** The bookmark's URL, before any redirects. */
  url: string;
  /** Picked once per run so that every request in the run uses the same proxy. */
  runProxy: RunProxyConfig;
  /** The downloaded file's name in VIDEO_TMP_FOLDER starts with it. */
  assetId: string;
  abortSignal: AbortSignal;
}

export type VideoDownloadResult =
  /** The video is at path. */
  | { status: "downloaded"; path: string; contentType: string }
  /** There's nothing to download, e.g. the URL isn't one yt-dlp supports. */
  | { status: "skipped"; reason: string }
  /** yt-dlp failed. Retrying the job isn't expected to help. */
  | { status: "failed"; reason: string };

const EXTENSION_CONTENT_TYPES: Record<string, ASSET_TYPES> = {
  ".mp4": ASSET_TYPES.VIDEO_MP4,
  ".m4v": ASSET_TYPES.VIDEO_MP4,
  ".webm": ASSET_TYPES.VIDEO_WEBM,
  ".mkv": ASSET_TYPES.VIDEO_MKV,
};

/**
 * Detects the video MIME type from container magic bytes, falling back to the
 * file extension and finally `video/mp4` so AssetStore validation always passes.
 */
export async function detectVideoContentType(
  filePath: string,
): Promise<string> {
  try {
    const fh = await fs.promises.open(filePath, "r");
    try {
      const buf = Buffer.alloc(64);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const header = buf.subarray(0, bytesRead);

      // ISO Base Media File Format (MP4): "ftyp" box at bytes 4..8
      if (
        bytesRead >= 8 &&
        header.subarray(4, 8).toString("ascii") === "ftyp"
      ) {
        return ASSET_TYPES.VIDEO_MP4;
      }

      // EBML container (WebM / Matroska): magic 0x1A 0x45 0xDF 0xA3
      if (
        bytesRead >= 4 &&
        header[0] === 0x1a &&
        header[1] === 0x45 &&
        header[2] === 0xdf &&
        header[3] === 0xa3
      ) {
        const headerStr = header.toString("ascii");
        if (headerStr.includes("webm")) {
          return ASSET_TYPES.VIDEO_WEBM;
        }
        if (headerStr.includes("matroska")) {
          return ASSET_TYPES.VIDEO_MKV;
        }
        const ext = path.extname(filePath).toLowerCase();
        return ext === ".mkv" ? ASSET_TYPES.VIDEO_MKV : ASSET_TYPES.VIDEO_WEBM;
      }
    } finally {
      await fh.close();
    }
  } catch {
    // Fall back to file extension below.
  }

  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_CONTENT_TYPES[ext] ?? ASSET_TYPES.VIDEO_MP4;
}

export interface VideoDownloader {
  /**
   * Downloads the video at the URL into VIDEO_TMP_FOLDER. Throws when the job
   * should be retried (e.g. the remote sandbox is unreachable).
   */
  download(req: VideoDownloadRequest): Promise<VideoDownloadResult>;
}

/**
 * yt-dlp adds a file extension to the file name it's given, so the downloaded
 * file has to be found by its asset id.
 */
export async function findVideoFile(assetId: string): Promise<string | null> {
  let files: string[];
  try {
    files = await fs.promises.readdir(VIDEO_TMP_FOLDER);
  } catch {
    return null;
  }
  const file = files.find((f) => f.startsWith(assetId));
  return file ? path.join(VIDEO_TMP_FOLDER, file) : null;
}

/** Deletes what's left of a download, e.g. when it failed partway through. */
export async function deleteVideoFile(
  jobId: string,
  assetId: string,
): Promise<void> {
  const file = await findVideoFile(assetId);
  if (!file) {
    return;
  }
  logger.info(
    `[VideoCrawler][${jobId}] Deleting leftover video asset "${file}".`,
  );
  try {
    await fs.promises.rm(file);
  } catch {
    logger.error(
      `[VideoCrawler][${jobId}] Failed deleting leftover video asset "${file}".`,
    );
  }
}
