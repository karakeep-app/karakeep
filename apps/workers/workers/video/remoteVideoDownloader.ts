// A VideoDownloader that has the remote sandbox run yt-dlp and streams back
// the video. Used by the video worker when SANDBOX_REMOTE_URL is set.

import fs, { createWriteStream } from "fs";
import path from "path";
import { pipeline } from "stream/promises";

import { tryCatch } from "@karakeep/shared/tryCatch";

import type { VideoDownloader } from "./common";
import { SKIP_REASON_HEADER, WORK_FAILED_STATUS } from "../sandbox/protocol";
import { bodyStream, postToSandbox, SandboxError } from "../sandbox/client";
import { VIDEO_TMP_FOLDER } from "./common";

export const remoteVideoDownloader: VideoDownloader = {
  download: async ({ jobId, url, runProxy, assetId, abortSignal }) => {
    let response: Response;
    try {
      response = await postToSandbox(
        "download-video",
        { jobId, url, runProxy },
        { signal: abortSignal },
      );
    } catch (e) {
      // yt-dlp itself failed, which the local downloader doesn't retry
      // either. Any other error is retried.
      if (e instanceof SandboxError && e.status === WORK_FAILED_STATUS) {
        return { status: "failed", reason: e.message };
      }
      throw e;
    }
    if (response.status === 204) {
      const reason = response.headers.get(SKIP_REASON_HEADER);
      return {
        status: "skipped",
        reason: reason
          ? decodeURIComponent(reason)
          : "the remote sandbox didn't download anything",
      };
    }

    await fs.promises.mkdir(VIDEO_TMP_FOLDER, { recursive: true });
    const assetPath = path.join(VIDEO_TMP_FOLDER, assetId);
    try {
      await pipeline(bodyStream(response), createWriteStream(assetPath));
    } catch (e) {
      await tryCatch(fs.promises.rm(assetPath, { force: true }));
      throw e;
    }
    return { status: "downloaded", path: assetPath };
  },
};
