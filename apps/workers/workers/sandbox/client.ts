// Sends requests to the remote sandbox (see protocol.ts). Used by the workers
// that hand their untrusted work to it when SANDBOX_REMOTE_URL is set.

import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";

import serverConfig from "@karakeep/shared/config";

import { encodeRequest, SANDBOX_BASE_PATH } from "./protocol";

export type SandboxEndpoint =
  | "probe-url"
  | "fetch-page"
  | "fetch-asset"
  | "archive-page"
  | "download-video"
  | "process-pdf"
  | "read-image-text";

/** The remote sandbox responded with an error status. */
export class SandboxError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`The remote sandbox responded with status ${status}: ${body}`);
  }
}

/** POSTs the request to the remote sandbox. Throws on an error status. */
export async function postToSandbox(
  endpoint: SandboxEndpoint,
  params: object,
  {
    html,
    file,
    signal,
  }: { html?: string; file?: Uint8Array; signal?: AbortSignal } = {},
): Promise<Response> {
  const { url, token } = serverConfig.sandbox;
  const { contentType, body } = encodeRequest(params, { html, file });
  const response = await fetch(
    `${url?.replace(/\/+$/, "")}${SANDBOX_BASE_PATH}/${endpoint}`,
    {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Bearer ${token}`,
      },
      body,
      signal,
    },
  );
  if (!response.ok) {
    throw new SandboxError(response.status, await response.text());
  }
  return response;
}

/** The response body as a node stream. */
export function bodyStream(response: Response): Readable {
  if (!response.body) {
    throw new Error("The remote sandbox's response has no body");
  }
  return Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
}
