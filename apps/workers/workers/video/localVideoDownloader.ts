// Downloads videos with yt-dlp, on this machine. Used by the video worker, and
// by the remote sandbox on behalf of video workers configured with
// SANDBOX_REMOTE_URL.

import fs from "fs";
import path from "path";
import { execa } from "execa";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import type { VideoDownloader } from "./common";
import { getProxyAgent, resolveValidatedRedirectUrl } from "../../network";
import { deleteVideoFile, findVideoFile, VIDEO_TMP_FOLDER } from "./common";

function prepareYtDlpArguments(
  url: string,
  proxy: string | undefined,
  assetPath: string,
) {
  // yt-dlp performs its own HTTP requests and can follow redirects that this
  // process cannot validate. Full SSRF protection depends on an egress proxy or
  // network policy that blocks internal/private targets.
  const ytDlpArguments = [url];
  if (serverConfig.crawler.maxVideoDownloadSize > 0) {
    ytDlpArguments.push(
      "-f",
      `best[filesize<${serverConfig.crawler.maxVideoDownloadSize}M]`,
    );
  }

  ytDlpArguments.push(...serverConfig.crawler.ytDlpArguments);
  ytDlpArguments.push("-o", assetPath);
  ytDlpArguments.push("--no-playlist");
  if (proxy) {
    ytDlpArguments.push("--proxy", proxy);
  }
  return ytDlpArguments;
}

export const localVideoDownloader: VideoDownloader = {
  download: async ({ jobId, url, runProxy, assetId, abortSignal }) => {
    let normalizedUrl: string;
    try {
      const resolvedUrl = await resolveValidatedRedirectUrl(
        url,
        { signal: abortSignal },
        runProxy,
      );
      normalizedUrl = resolvedUrl.toString();
    } catch (error) {
      return {
        status: "skipped",
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    const assetPath = path.join(VIDEO_TMP_FOLDER, assetId);
    await fs.promises.mkdir(VIDEO_TMP_FOLDER, { recursive: true });

    const proxy = getProxyAgent(normalizedUrl, runProxy);
    const ytDlpArguments = prepareYtDlpArguments(
      normalizedUrl,
      proxy?.proxy.toString(),
      assetPath,
    );

    try {
      logger.info(
        `[VideoCrawler][${jobId}] Attempting to download a file from "${normalizedUrl}" to "${assetPath}" using the following arguments: "${ytDlpArguments}"`,
      );
      await execa("yt-dlp", ytDlpArguments, { cancelSignal: abortSignal });
    } catch (e) {
      const err = e as Error;
      if (
        err.message.includes("ERROR: Unsupported URL:") ||
        err.message.includes("No media found")
      ) {
        return {
          status: "skipped",
          reason: `"${normalizedUrl}" isn't one of the supported yt-dlp URLs`,
        };
      }
      await deleteVideoFile(jobId, assetId);
      return {
        status: "failed",
        reason:
          "stderr" in err && err.stderr ? String(err.stderr) : err.message,
      };
    }

    const downloadPath = await findVideoFile(assetId);
    if (!downloadPath) {
      return { status: "skipped", reason: "yt-dlp didn't download anything" };
    }
    logger.info(
      `[VideoCrawler][${jobId}] Finished downloading a file from "${normalizedUrl}" to "${downloadPath}"`,
    );
    return { status: "downloaded", path: downloadPath };
  },
};
