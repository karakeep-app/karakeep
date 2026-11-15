// An AssetProcessor that sends the asset to the remote sandbox to be parsed
// there. Used by the asset preprocessing worker when SANDBOX_REMOTE_URL is
// set.

import type { AssetJob, AssetProcessor } from "./common";
import { postToSandbox, SandboxError } from "../sandbox/client";
import {
  WORK_FAILED_STATUS,
  zImageTextResponseSchema,
  zPdfTextResponseSchema,
} from "../sandbox/protocol";
import { AssetProcessorUnavailableError } from "./common";

async function post<T>(
  endpoint: "pdf-text" | "pdf-screenshot" | "image-text",
  job: AssetJob,
  file: Buffer,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  try {
    const response = await postToSandbox(
      endpoint,
      { jobId: job.jobId },
      { file, signal: job.abortSignal },
    );
    return await read(response);
  } catch (e) {
    // The asset failed to parse on the sandbox, as it could have locally.
    if (e instanceof SandboxError && e.status === WORK_FAILED_STATUS) {
      throw e;
    }
    throw new AssetProcessorUnavailableError(
      `The remote sandbox couldn't process the asset: ${e}`,
      { cause: e },
    );
  }
}

export const remoteAssetProcessor: AssetProcessor = {
  readPdfText: (job, pdf) =>
    post("pdf-text", job, pdf, async (response) =>
      zPdfTextResponseSchema.parse(await response.json()),
    ),

  renderPdfScreenshot: (job, pdf) =>
    post("pdf-screenshot", job, pdf, async (response) =>
      Buffer.from(await response.arrayBuffer()),
    ),

  readImageText: (job, image) =>
    post(
      "image-text",
      job,
      image,
      async (response) =>
        zImageTextResponseSchema.parse(await response.json()).text,
    ),
};
