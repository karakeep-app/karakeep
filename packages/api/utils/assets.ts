import { Context } from "hono";
import { stream } from "hono/streaming";

import {
  createAssetReadStream,
  getAssetSize,
  readAssetMetadata,
} from "@karakeep/shared/assetdb";

import { toWebReadableStream } from "./upload";

export async function serveAsset(c: Context, assetId: string, userId: string) {
  const [metadata, size] = await Promise.all([
    readAssetMetadata({
      userId,
      assetId,
    }),

    getAssetSize({
      userId,
      assetId,
    }),
  ]);

  // Default Headers
  c.header("Content-type", metadata.contentType);
  c.header("X-Content-Type-Options", "nosniff");
  c.header(
    "Content-Security-Policy",
    [
      "sandbox",
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "img-src https: data: blob:",
      "style-src 'unsafe-inline' https:",
      "connect-src 'none'",
      "media-src https: data: blob:",
      "object-src 'none'",
      "frame-src 'none'",
    ].join("; "),
  );

  const range = c.req.header("Range");
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

    const fStream = await createAssetReadStream({
      userId,
      assetId,
      start,
      end,
    });
    c.status(206); // Partial Content
    c.header("Content-Range", `bytes ${start}-${end}/${size}`);
    c.header("Accept-Ranges", "bytes");
    c.header("Content-Length", (end - start + 1).toString());
    return stream(c, async (stream) => {
      await stream.pipe(toWebReadableStream(fStream));
    });
  } else {
    const fStream = await createAssetReadStream({
      userId,
      assetId,
    });
    c.status(200);
    c.header("Content-Length", size.toString());
    return stream(c, async (stream) => {
      await stream.pipe(toWebReadableStream(fStream));
    });
  }
}
