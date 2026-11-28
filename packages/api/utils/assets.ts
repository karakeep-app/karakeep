import { Context } from "hono";
import { stream } from "hono/streaming";

import { AssetTypes } from "@karakeep/db/schema";
import { ASSET_TYPES } from "@karakeep/shared/assetdb";
import {
  createAssetReadStream,
  getAssetSize,
  readAssetMetadata,
  SUPPORTED_UPLOAD_ASSET_TYPES,
} from "@karakeep/shared-server";

import { toWebReadableStream } from "./upload";

export async function serveAsset(
  c: Context,
  assetId: string,
  userId: string,
  assetType: string,
) {
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
  if (
    metadata.downloadOnly ||
    // Legacy uploads allow HTML page archives without purpose=attachment.
    // If attached as a user file, they must download rather than render inline.
    (assetType === AssetTypes.USER_UPLOADED &&
      (!SUPPORTED_UPLOAD_ASSET_TYPES.has(metadata.contentType) ||
        metadata.contentType === ASSET_TYPES.TEXT_HTML))
  ) {
    // RFC 5987 encoding keeps names out of HTTP syntax, including CR/LF.
    const name = encodeURIComponent(metadata.fileName ?? "attachment").replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    c.header(
      "Content-Disposition",
      `attachment; filename="attachment"; filename*=UTF-8''${name}`,
    );
  }
  c.header("Cache-Control", "private, max-age=31536000, immutable");
  c.header(
    "Content-Security-Policy",
    [
      "sandbox",
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "img-src https: data: blob:",
      "style-src 'unsafe-inline' https: data:",
      "font-src https: data:",
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
