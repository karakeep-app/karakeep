// An AssetProcessor that sends the asset to the remote sandbox to be parsed
// there. Used by the asset preprocessing worker when SANDBOX_REMOTE_URL is
// set.

import type { AssetJob, AssetProcessor, PdfResult } from "./common";
import { postToSandbox, SandboxError } from "../sandbox/client";
import {
  readJsonPart,
  readParts,
  unexpectedPart,
  WORK_FAILED_STATUS,
  zImageTextResponseSchema,
} from "../sandbox/protocol";
import { AssetProcessorUnavailableError } from "./common";

async function post<T>(
  endpoint: "process-pdf" | "read-image-text",
  job: AssetJob,
  params: object,
  file: Buffer,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  try {
    const response = await postToSandbox(
      endpoint,
      { jobId: job.jobId, ...params },
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
  processPdf: (job, pdf, steps) =>
    post("process-pdf", job, steps, pdf, async (response) => {
      const result: PdfResult = {};
      for await (const part of readParts(response)) {
        switch (part.name) {
          case "pdfText":
            result.text = { ok: true, value: readJsonPart(part, "pdfText") };
            break;
          case "pdfTextError":
            result.text = {
              ok: false,
              error: readJsonPart(part, "pdfTextError").message,
            };
            break;
          case "screenshot":
            result.screenshot = { ok: true, value: Buffer.from(part.bytes) };
            break;
          case "screenshotError":
            result.screenshot = {
              ok: false,
              error: readJsonPart(part, "screenshotError").message,
            };
            break;
          default:
            throw unexpectedPart(part);
        }
      }
      if (
        (steps.text && !result.text) ||
        (steps.screenshot && !result.screenshot)
      ) {
        throw new Error("The remote sandbox's response was incomplete");
      }
      return result;
    }),

  readImageText: (job, image) =>
    post(
      "read-image-text",
      job,
      {},
      image,
      async (response) =>
        zImageTextResponseSchema.parse(await response.json()).text,
    ),
};
