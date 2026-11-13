import type { MultipartPart } from "@remix-run/multipart-parser";
import { describe, expect, it } from "vitest";

import {
  decodeRequest,
  encodeRequest,
  jsonPart,
  MultipartWriter,
  readJsonPart,
  readParts,
  zArchivePageRequestSchema,
} from "./protocol";

function responseOf(writer: MultipartWriter, body: ReadableStream) {
  return new Response(body, {
    headers: { "Content-Type": writer.contentType },
  });
}

function chunked(buf: Buffer, size: number) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < buf.byteLength; i += size) {
        controller.enqueue(buf.subarray(i, i + size));
      }
      controller.close();
    },
  });
}

async function readAll(response: Response) {
  const parts: MultipartPart[] = [];
  for await (const part of readParts(response)) {
    parts.push(part);
  }
  return parts;
}

const html = "<html><body>héllo</body></html>";
const screenshot = Buffer.from([0xff, 0xd8, 0x00, 0x0d, 0x0a, 0x2d, 0xff]);
const parsed = {
  metadata: { title: "Example" },
  readableContent: { content: "<p>héllo</p>" },
  readerViewAssessment: null,
};

const writer = new MultipartWriter();
const body = Buffer.concat([
  writer.start(),
  writer.part(
    jsonPart("page", { statusCode: 200, url: "https://example.com/" }),
  ),
  writer.part({ name: "html", contentType: "text/html", data: html }),
  writer.part({
    name: "screenshot",
    contentType: "image/jpeg",
    data: screenshot,
  }),
  writer.part(jsonPart("parsed", parsed), { last: true }),
]);

describe("remote crawler protocol", () => {
  it.each([1, 3, 7, 4096])(
    "reads parts split into %i-byte chunks",
    async (chunkSize) => {
      const parts = await readAll(responseOf(writer, chunked(body, chunkSize)));
      expect(parts.map((p) => p.name)).toEqual([
        "page",
        "html",
        "screenshot",
        "parsed",
      ]);
      expect(readJsonPart(parts[0], "page")).toEqual({
        statusCode: 200,
        url: "https://example.com/",
      });
      expect(parts[1].text).toBe(html);
      expect(Buffer.compare(Buffer.from(parts[2].bytes), screenshot)).toBe(0);
      expect(readJsonPart(parts[3], "parsed")).toEqual(parsed);
    },
  );

  it("yields each part before the next one is written", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start: (c) => void (controller = c),
    });
    const parts = readParts(responseOf(writer, stream));
    controller.enqueue(writer.start());
    controller.enqueue(
      writer.part(jsonPart("contentType", { contentType: "text/html" })),
    );
    const { value } = await parts.next();
    expect(readJsonPart(value!, "contentType")).toEqual({
      contentType: "text/html",
    });
    controller.enqueue(writer.part(jsonPart("metadata", null), { last: true }));
    controller.close();
    expect((await parts.next()).value?.name).toBe("metadata");
    expect((await parts.next()).done).toBe(true);
  });

  it("throws on an error part", async () => {
    const failed = Buffer.concat([
      writer.start(),
      writer.part(
        jsonPart("page", { statusCode: 200, url: "https://example.com/" }),
      ),
      writer.part(jsonPart("error", { message: "the parse timed out" }), {
        last: true,
      }),
    ]);
    await expect(
      readAll(responseOf(writer, chunked(failed, 16))),
    ).rejects.toThrow("The remote crawler failed: the parse timed out");
  });

  it.each([3, 40])(
    "rejects a response cut off %i bytes before the end",
    async (cut) => {
      await expect(
        readAll(
          responseOf(writer, chunked(body.subarray(0, body.length - cut), 5)),
        ),
      ).rejects.toThrow();
    },
  );

  const ctx = {
    jobId: "job",
    bookmarkId: "bookmark",
    userId: "user",
    url: "https://example.com/",
    runProxy: {},
    browserCrawlingEnabled: true,
  };

  function requestOf(params: object, html?: string) {
    const { contentType, body } = encodeRequest(params, html);
    return new Request("http://remote/archive", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
  }

  it("round-trips a request with its html", async () => {
    expect(
      await decodeRequest(
        requestOf({ ctx, url: "https://example.com/" }, html),
        zArchivePageRequestSchema,
      ),
    ).toEqual({ ctx, url: "https://example.com/", html });
  });

  it("rejects a request missing its required html", async () => {
    expect(
      await decodeRequest(
        requestOf({ ctx, url: "https://example.com/" }),
        zArchivePageRequestSchema,
      ),
    ).toBeNull();
  });
});
