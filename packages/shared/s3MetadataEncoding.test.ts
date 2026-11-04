import { describe, expect, it } from "vitest";

import {
  decodeS3MetadataValue,
  encodeS3MetadataValue,
} from "./s3MetadataEncoding";

describe("S3 metadata value encoding", () => {
  it("stores plain ASCII values verbatim", () => {
    expect(encodeS3MetadataValue("photo.jpg")).toBe("photo.jpg");
    expect(encodeS3MetadataValue("report (final) v2.pdf")).toBe(
      "report (final) v2.pdf",
    );
    expect(encodeS3MetadataValue("")).toBe("");
  });

  it("wraps non-ASCII values as an ASCII-only encoded word", () => {
    const encoded = encodeS3MetadataValue("Prüfung Größe Öl.pdf");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    // Every byte must be a printable ASCII character, otherwise Node's HTTP
    // client rejects the header (ERR_INVALID_CHAR, #1765).
    expect(encoded).toMatch(/^[\x20-\x7e]*$/);
  });

  it("round-trips non-ASCII values losslessly", () => {
    for (const name of [
      "Prüfung Größe Öl.pdf",
      "報告 2026.pdf",
      "résumé_日本語.png",
      "🦞.txt",
    ]) {
      expect(decodeS3MetadataValue(encodeS3MetadataValue(name))).toBe(name);
    }
  });

  it("round-trips a literal value that looks like an encoded word", () => {
    const literal = "=?UTF-8?B?SGVsbG8=?=";
    const encoded = encodeS3MetadataValue(literal);
    expect(encoded).not.toBe(literal);
    expect(encoded).toMatch(/^[\x20-\x7e]*$/);
    expect(decodeS3MetadataValue(encoded)).toBe(literal);
  });

  it("passes through values that are not encoded words", () => {
    expect(decodeS3MetadataValue("photo.jpg")).toBe("photo.jpg");
    expect(decodeS3MetadataValue("=?not-an-encoded-word")).toBe(
      "=?not-an-encoded-word",
    );
  });
});
