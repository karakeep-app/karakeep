// An AssetProcessor that sends the asset to the remote sandbox to be parsed
// there. Used by the asset preprocessing worker when SANDBOX_REMOTE_URL is
// set.

import type { MultipartPart } from "@remix-run/multipart-parser";

import type { AssetProcessor, PdfStepResult } from "./common";
import { postToSandbox, SandboxError } from "../sandbox/client";
import {
  readJsonPart,
  readParts,
  unexpectedPart,
  WORK_FAILED_STATUS,
  zImageTextResponseSchema,
} from "../sandbox/protocol";
import { AssetProcessorUnavailableError } from "./common";

/**
 * The error to throw for a failed request: the sandbox's own when the asset
 * failed to parse there (as it could have locally), and otherwise one that
 * says the sandbox couldn't do the work.
 */
function processorError(e: unknown): Error {
  if (e instanceof SandboxError && e.status === WORK_FAILED_STATUS) {
    return e;
  }
  return new AssetProcessorUnavailableError(
    `The remote sandbox couldn't process the asset: ${e}`,
    { cause: e },
  );
}

function readPdfStepPart(part: MultipartPart): PdfStepResult {
  switch (part.name) {
    case "pdfText":
      return {
        step: "text",
        result: { ok: true, value: readJsonPart(part, "pdfText") },
      };
    case "pdfTextError":
      return {
        step: "text",
        result: {
          ok: false,
          error: readJsonPart(part, "pdfTextError").message,
        },
      };
    case "screenshot":
      return {
        step: "screenshot",
        result: { ok: true, value: Buffer.from(part.bytes) },
      };
    case "screenshotError":
      return {
        step: "screenshot",
        result: {
          ok: false,
          error: readJsonPart(part, "screenshotError").message,
        },
      };
    default:
      throw unexpectedPart(part);
  }
}

export const remoteAssetProcessor: AssetProcessor = {
  processPdf: async function* (job, pdf, steps) {
    // Stopping early drops the connection, so the sandbox stops too.
    const stopped = new AbortController();
    try {
      let response: Response;
      try {
        response = await postToSandbox(
          "process-pdf",
          { jobId: job.jobId, ...steps },
          {
            file: pdf,
            signal: AbortSignal.any([job.abortSignal, stopped.signal]),
          },
        );
      } catch (e) {
        throw processorError(e);
      }
      const missing = new Set<PdfStepResult["step"]>();
      if (steps.text) {
        missing.add("text");
      }
      if (steps.screenshot) {
        missing.add("screenshot");
      }
      try {
        // Each part is yielded as soon as it arrives.
        for await (const part of readParts(response)) {
          const result = readPdfStepPart(part);
          missing.delete(result.step);
          yield result;
        }
      } catch (e) {
        throw processorError(e);
      }
      if (missing.size > 0) {
        throw new AssetProcessorUnavailableError(
          "The remote sandbox's response was incomplete",
        );
      }
    } finally {
      stopped.abort();
    }
  },

  readImageText: async (job, image) => {
    try {
      const response = await postToSandbox(
        "read-image-text",
        { jobId: job.jobId },
        { file: image, signal: job.abortSignal },
      );
      return zImageTextResponseSchema.parse(await response.json()).text;
    } catch (e) {
      throw processorError(e);
    }
  },
};
