// An AssetProcessor that sends the asset to the remote sandbox to be parsed
// there. Used by the asset preprocessing worker when SANDBOX_REMOTE_URL is
// set.

import type { AssetJob, AssetProcessor } from "./common";
import {
  zImageTextResponseSchema,
  zPdfTextResponseSchema,
} from "../sandbox/protocol";
import { postToSandbox } from "../sandbox/client";

function post(
  endpoint: "pdf-text" | "pdf-screenshot" | "image-text",
  job: AssetJob,
  file: Buffer,
) {
  return postToSandbox(
    endpoint,
    { jobId: job.jobId },
    { file, signal: job.abortSignal },
  );
}

export const remoteAssetProcessor: AssetProcessor = {
  readPdfText: async (job, pdf) => {
    const response = await post("pdf-text", job, pdf);
    const { text, metadata } = zPdfTextResponseSchema.parse(
      await response.json(),
    );
    return { text, metadata };
  },

  renderPdfScreenshot: async (job, pdf) => {
    const response = await post("pdf-screenshot", job, pdf);
    return Buffer.from(await response.arrayBuffer());
  },

  readImageText: async (job, image) => {
    const response = await post("image-text", job, image);
    return zImageTextResponseSchema.parse(await response.json()).text;
  },
};
