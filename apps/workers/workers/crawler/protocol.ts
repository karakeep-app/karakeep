// The protocol between the crawler worker and a remote crawler (a worker
// started with CRAWLER_REMOTE_SERVER_ENABLED=true). There's one endpoint per
// Crawler method. The worker POSTs a multipart request: a "request" part with
// the JSON parameters, and an "html" part for the HTML that /page (a
// precrawled archive) and /archive take. The remote crawler responds with:
//
//   /probe:   multipart parts: contentType, metadata
//   /page:    multipart parts: page, [html], [screenshot], [pdf], parsed
//   /asset:   the file
//   /archive: the archived page
//
// The multipart responses (multipart/form-data, binary parts as is) send each
// part as soon as it's ready, so the worker can act on the content type while
// the metadata is being extracted. A failure partway through ends the
// response with an error part. A response without its closing boundary was
// cut off, and the parser rejects it.
//
// The file responses fail with an HTTP error status if the download or
// archiving fails before sending starts. A failure partway through drops the
// connection, so a truncated file never looks complete to the worker.

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

export const REMOTE_CRAWLER_BASE_PATH = "/crawler/v1";

// The serializable part of the CrawlContext. The remote crawler uses the
// proxy the worker picked for the run, so all of a run's requests share it.
const zCrawlContextSchema = z.object({
  jobId: z.string(),
  bookmarkId: z.string(),
  userId: z.string(),
  url: z.string(),
  runProxy: z
    .object({
      httpProxy: z.string().optional(),
      httpsProxy: z.string().optional(),
      noProxy: z.array(z.string()).optional(),
    })
    .transform((p): RunProxyConfig => ({
      httpProxy: p.httpProxy,
      httpsProxy: p.httpsProxy,
      noProxy: p.noProxy,
    })),
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

const zJsonParts = {
  contentType: z.object({ contentType: z.string().nullable() }),
  metadata: parseSubprocessMetadataSchema.nullable(),
  page: z.object({ statusCode: z.number(), url: z.string() }),
  parsed: parseSubprocessOutputSchema.nullable(),
  error: z.object({ message: z.string() }),
};
type JsonPartName = keyof typeof zJsonParts;
type JsonParts = {
  [N in JsonPartName]: z.infer<(typeof zJsonParts)[N]>;
};

export interface Part {
  name: JsonPartName | "request" | "html" | "screenshot" | "pdf";
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

/** Encodes a request: its JSON parameters, and the HTML it carries, if any. */
export function encodeRequest(params: object, html?: string) {
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
  try {
    // The requests are authenticated, and a precrawled archive can be larger
    // than the parser's default limits.
    for await (const part of parseMultipartStream(request.body, {
      boundary,
      maxFileSize: Infinity,
      maxTotalSize: Infinity,
    })) {
      if (part.name === "request") {
        params = JSON.parse(part.text) as object;
      } else if (part.name === "html") {
        html = part.text;
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }
  const parsed = schema.safeParse({ ...params, html });
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
    throw new Error("The remote crawler didn't send a multipart response");
  }
  // The remote crawler is trusted, and the html, screenshot and PDF can be
  // larger than the parser's default limits.
  for await (const part of parseMultipartStream(response.body, {
    boundary,
    maxFileSize: Infinity,
    maxTotalSize: Infinity,
  })) {
    if (part.name === "error") {
      throw new Error(
        `The remote crawler failed: ${readJsonPart(part, "error").message}`,
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
  return new Error(`Unexpected "${part.name}" part from the remote crawler`);
}
