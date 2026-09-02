// S3 user-defined metadata is sent as HTTP headers, which only accept
// US-ASCII. Node rejects anything else with ERR_INVALID_CHAR (see #1765).
// Values that need it are wrapped as an RFC 2047 "encoded-word" so the
// original (e.g. a non-ASCII file name) survives the round trip; plain ASCII
// values are stored verbatim so existing objects keep working unchanged.

// eslint-disable-next-line no-control-regex
const ASCII_ONLY = /^[\x20-\x7e]*$/;
const ENCODED_WORD = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]*)\?=$/;

export function encodeS3MetadataValue(value: string): string {
  // A literal value that already looks like an encoded-word must be encoded
  // too, otherwise decodeS3MetadataValue would unwrap it on the way back.
  if (ASCII_ONLY.test(value) && !ENCODED_WORD.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function decodeS3MetadataValue(value: string): string {
  const match = ENCODED_WORD.exec(value);
  if (!match) {
    return value;
  }
  return Buffer.from(match[1], "base64").toString("utf8");
}
