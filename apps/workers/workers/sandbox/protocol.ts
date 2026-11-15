// The protocol between the workers and a remote sandbox (a worker started
// with SANDBOX_REMOTE_SERVER_ENABLED=true). The remote sandbox does the work
// that handles untrusted content: the crawler worker's (one endpoint per
// Crawler method), the video worker's yt-dlp downloads, and the asset
// preprocessing worker's PDF parsing, PDF screenshots and OCR.
//
// The workers POST a multipart request: a "request" part with the JSON
// parameters, an "html" part for the HTML that /fetch-page (a precrawled
// archive) and /archive-page take, and a "file" part for the asset that
// /process-pdf and /read-image-text take. The remote sandbox responds with:
//
//   /probe-url:       multipart parts: contentType, metadata
//   /fetch-page:      multipart parts: page, [html], [screenshot], [pdf], parsed
//   /fetch-asset:     the file
//   /archive-page:    the archived page
//   /download-video:  the video, or 204 No Content when there's nothing to
//                     download, with the reason in the X-Skip-Reason header
//   /process-pdf:     multipart parts, for the steps requested: pdfText (or
//                     pdfTextError), screenshot (or screenshotError)
//   /read-image-text: JSON: the image's text (OCR), or null
//
// The multipart responses (multipart/form-data, binary parts as is) send each
// part as soon as it's ready, so the worker can act on the content type while
// the metadata is being extracted. A failure partway through ends the
// response with an error part. A response without its closing boundary was
// cut off, and the parser rejects it. /process-pdf runs each step even if the
// other one fails, and reports a step's failure in its own error part.
//
// The other responses fail with an HTTP error status if anything fails before
// sending starts: WORK_FAILED_STATUS when the work itself failed on the input
// (e.g. yt-dlp or the PDF parser failed), and any other status when the
// sandbox couldn't do the work (e.g. 504 when its timeout passed first). A
// failure partway through drops the connection, so a truncated file never
// looks complete to the worker.

import type { RunProxyConfig } from "../../network";
import type { MultipartPart } from "@remix-run/multipart-parser";
import { randomUUID } from "crypto";
import {
  getMultipartBoundary,
  parseMultipartStream,
} from "@remix-run/multipart-parser";
import { z } from "zod";

import {
  parseSubprocessMetadataSchema,
  parseSubprocessOutputSchema,
} from "../utils/parseHtmlSubprocessIpc";

export const SANDBOX_BASE_PATH = "/sandbox/v1";

/**
 * The status of a response whose work failed on the input, e.g. yt-dlp failed
 * to download the video. Retrying isn't expected to help, unlike after any
 * other error status, which says the sandbox couldn't do the work (it's
 * overloaded, or a proxy in front of it can't reach it). So it's one that
 * proxies don't send on their own.
 */
export const WORK_FAILED_STATUS = 422;

/** The header of a /download-video 204 response that says why nothing was downloaded. */
export const SKIP_REASON_HEADER = "X-Skip-Reason";

// The remote sandbox uses the proxy the worker picked for the run, so all of a
// run's requests share it.
const zRunProxySchema = z
  .object({
    httpProxy: z.string().optional(),
    httpsProxy: z.string().optional(),
    noProxy: z.array(z.string()).optional(),
  })
  .transform((p): RunProxyConfig => ({
    httpProxy: p.httpProxy,
    httpsProxy: p.httpsProxy,
    noProxy: p.noProxy,
  }));

// The serializable part of the CrawlContext.
const zCrawlContextSchema = z.object({
  jobId: z.string(),
  bookmarkId: z.string(),
  userId: z.string(),
  url: z.string(),
  runProxy: zRunProxySchema,
  browserCrawlingEnabled: z.boolean(),
});
export type SerializedCrawlContext = z.infer<typeof zCrawlContextSchema>;

export const zProbeRequestSchema = z.object({
  ctx: zCrawlContextSchema,
  skipMetadataExtraction: z.boolean().optional(),
});

// "html" is the precrawled archive, if any.
export const zFetchPageRequestSchema = z.object({
  ctx: zCrawlContextSchema,
  forceStorePdf: z.boolean(),
  html: z.string().optional(),
  skipParseOnRetryableStatus: z.boolean(),
  skipScreenshot: z.boolean().optional(),
  skipPdf: z.boolean().optional(),
  skipParse: z.boolean().optional(),
});

export const zFetchAssetRequestSchema = z.object({
  ctx: zCrawlContextSchema,
  url: z.string(),
  fileType: z.string(),
});

export const zArchivePageRequestSchema = z.object({
  ctx: zCrawlContextSchema,
  html: z.string(),
  url: z.string(),
});

export const zDownloadVideoRequestSchema = z.object({
  jobId: z.string(),
  url: z.string(),
  runProxy: zRunProxySchema,
});

// For /read-image-text. "file" is the asset. Like "html", it's sent as is in
// its own multipart part, not in the JSON parameters: decodeRequest adds it
// to them before they're validated.
export const zProcessAssetRequestSchema = z.object({
  jobId: z.string(),
  file: z.instanceof(Uint8Array),
});

// The steps to run on the PDF, at least one.
export const zProcessPdfRequestSchema = zProcessAssetRequestSchema
  .extend({ text: z.boolean(), screenshot: z.boolean() })
  .refine((r) => r.text || r.screenshot);

export const zImageTextResponseSchema = z.object({
  text: z.string().nullable(),
});

const zJsonParts = {
  contentType: z.object({ contentType: z.string().nullable() }),
  metadata: parseSubprocessMetadataSchema.nullable(),
  page: z.object({ statusCode: z.number(), url: z.string() }),
  parsed: parseSubprocessOutputSchema.nullable(),
  pdfText: z.object({
    text: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  }),
  pdfTextError: z.object({ message: z.string() }),
  screenshotError: z.object({ message: z.string() }),
  error: z.object({ message: z.string() }),
};
type JsonPartName = keyof typeof zJsonParts;
type JsonParts = {
  [N in JsonPartName]: z.infer<(typeof zJsonParts)[N]>;
};

export interface Part {
  name: JsonPartName | "request" | "html" | "file" | "screenshot" | "pdf";
  contentType: string;
  data: string | Uint8Array;
}

export function jsonPart<N extends JsonPartName>(
  name: N,
  value: JsonParts[N],
): Part {
  return {
    name,
    contentType: "application/json",
    data: JSON.stringify(value),
  };
}

/** Writes a multipart body, one part at a time. */
export class MultipartWriter {
  readonly boundary = `karakeep-${randomUUID()}`;
  readonly contentType = `multipart/form-data; boundary=${this.boundary}`;

  /** The whole body, for when all the parts are ready. */
  body(parts: Part[]): Buffer {
    return Buffer.concat([
      this.start(),
      ...parts.map((part, i) =>
        this.part(part, { last: i === parts.length - 1 }),
      ),
    ]);
  }

  /** The opening boundary. */
  start(): Buffer {
    return Buffer.from(`--${this.boundary}\r\n`, "utf8");
  }

  /**
   * Each part ends with the boundary (and the CRLF or "--" after it) that the
   * parser needs to see before it yields the part. So the last part must be
   * written with last: true, which closes the body.
   */
  part(part: Part, { last = false } = {}): Buffer {
    return Buffer.concat([
      Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"\r\n` +
          `Content-Type: ${part.contentType}\r\n\r\n`,
        "utf8",
      ),
      typeof part.data === "string"
        ? Buffer.from(part.data, "utf8")
        : part.data,
      Buffer.from(`\r\n--${this.boundary}${last ? "--" : ""}\r\n`, "utf8"),
    ]);
  }
}

/**
 * Encodes a request: its JSON parameters, and the HTML or file it carries, if
 * any.
 */
export function encodeRequest(
  params: object,
  { html, file }: { html?: string; file?: Uint8Array } = {},
) {
  const writer = new MultipartWriter();
  const parts: Part[] = [
    {
      name: "request",
      contentType: "application/json",
      data: JSON.stringify(params),
    },
  ];
  if (html !== undefined) {
    parts.push({
      name: "html",
      contentType: "text/html; charset=utf-8",
      data: html,
    });
  }
  if (file !== undefined) {
    parts.push({
      name: "file",
      contentType: "application/octet-stream",
      data: file,
    });
  }
  return {
    contentType: writer.contentType,
    // Buffer.concat always allocates a new (non-shared) ArrayBuffer.
    body: writer.body(parts) as Uint8Array<ArrayBuffer>,
  };
}

/** Decodes a request, or returns null if it's malformed. */
export async function decodeRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const boundary = getMultipartBoundary(
    request.headers.get("content-type") ?? "",
  );
  if (!boundary || !request.body) {
    return null;
  }
  let params: object | undefined;
  let html: string | undefined;
  let file: Uint8Array | undefined;
  try {
    // The requests are authenticated, and a precrawled archive or an asset can
    // be larger than the parser's default limits.
    for await (const part of parseMultipartStream(request.body, {
      boundary,
      maxFileSize: Infinity,
      maxTotalSize: Infinity,
    })) {
      if (part.name === "request") {
        params = JSON.parse(part.text) as object;
      } else if (part.name === "html") {
        html = part.text;
      } else if (part.name === "file") {
        file = part.bytes;
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }
  const parsed = schema.safeParse({ ...params, html, file });
  return parsed.success ? parsed.data : null;
}

/**
 * The parts of a multipart response as they arrive. Throws on an error part,
 * or if the response was cut off.
 */
export async function* readParts(
  response: Response,
): AsyncGenerator<MultipartPart> {
  const boundary = getMultipartBoundary(
    response.headers.get("content-type") ?? "",
  );
  if (!boundary || !response.body) {
    throw new Error("The remote sandbox didn't send a multipart response");
  }
  // The remote sandbox is trusted, and the html, screenshot and PDF can be
  // larger than the parser's default limits.
  for await (const part of parseMultipartStream(response.body, {
    boundary,
    maxFileSize: Infinity,
    maxTotalSize: Infinity,
  })) {
    if (part.name === "error") {
      throw new Error(
        `The remote sandbox failed: ${readJsonPart(part, "error").message}`,
      );
    }
    yield part;
  }
}

export function readJsonPart<N extends JsonPartName>(
  part: MultipartPart,
  name: N,
): JsonParts[N] {
  if (part.name !== name) {
    throw unexpectedPart(part);
  }
  return zJsonParts[name].parse(JSON.parse(part.text)) as JsonParts[N];
}

export function unexpectedPart(part: MultipartPart): Error {
  return new Error(`Unexpected "${part.name}" part from the remote sandbox`);
}
