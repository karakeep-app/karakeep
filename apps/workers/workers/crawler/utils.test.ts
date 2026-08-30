import { describe, expect, it } from "vitest";

import { decodeHtmlResponse, normalizeHtmlCharset } from "./utils";

// Pre-encoded fixtures (Node Buffers can't encode legacy encodings).
const ORICON_NEWS_SJIS = [
  131, 73, 131, 138, 131, 82, 131, 147, 131, 106, 131, 133, 129, 91, 131, 88,
]; // オリコンニュース in Shift_JIS
const NIHONGO_EUCJP = [
  198, 252, 203, 220, 184, 236, 164, 206, 165, 198, 165, 185, 165, 200,
]; // 日本語のテスト in EUC-JP
const META_SJIS_HEAD_TITLE = [
  60, 109, 101, 116, 97, 32, 104, 116, 116, 112, 45, 101, 113, 117, 105, 118,
  61, 34, 67, 111, 110, 116, 101, 110, 116, 45, 84, 121, 112, 101, 34, 32, 99,
  111, 110, 116, 101, 110, 116, 61, 34, 116, 101, 120, 116, 47, 104, 116, 109,
  108, 59, 32, 99, 104, 97, 114, 115, 101, 116, 61, 115, 104, 105, 102, 116, 95,
  106, 105, 115, 34, 62, 60, 116, 105, 116, 108, 101, 62, 131, 101, 131, 88,
  131, 103, 60, 47, 116, 105, 116, 108, 101, 62,
]; // <meta http-equiv content-type shift_jis><title>テスト</title>

function htmlResponse(bytes: number[], contentType: string | null): Response {
  return new Response(new Uint8Array(bytes), {
    headers: contentType ? { "content-type": contentType } : {},
  });
}

describe("normalizeHtmlCharset", () => {
  it("rewrites a bare meta charset declaration to UTF-8", () => {
    const html =
      '<html><head><meta charset="shift_jis"><title>テスト</title></head><body>日本語</body></html>';
    expect(normalizeHtmlCharset(html)).toBe(
      '<html><head><meta charset="UTF-8"><title>テスト</title></head><body>日本語</body></html>',
    );
  });

  it("rewrites http-equiv Content-Type meta declarations to UTF-8", () => {
    const html =
      '<head><meta http-equiv="Content-Type" content="text/html; charset=EUC-JP"></head>';
    expect(normalizeHtmlCharset(html)).toBe(
      '<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>',
    );
  });

  it("handles unquoted and single-quoted values", () => {
    expect(normalizeHtmlCharset("<meta charset=shift_jis>")).toBe(
      "<meta charset=UTF-8>",
    );
    expect(normalizeHtmlCharset("<meta charset='sjis'>")).toBe(
      "<meta charset='UTF-8'>",
    );
  });

  it("leaves meta tags without a charset untouched", () => {
    const html =
      '<meta name="viewport" content="width=device-width"><meta charset=UTF-8>';
    expect(normalizeHtmlCharset(html)).toBe(html);
  });

  it("does not touch charset-like strings outside meta tags", () => {
    const html =
      '<script>const url = "?charset=shift_jis";</script><meta charset=big5>';
    expect(normalizeHtmlCharset(html)).toBe(
      '<script>const url = "?charset=shift_jis";</script><meta charset=UTF-8>',
    );
  });
});

describe("decodeHtmlResponse", () => {
  it("decodes a Shift_JIS body declared in the Content-Type header", async () => {
    const decoded = await decodeHtmlResponse(
      htmlResponse(
        [
          ...Buffer.from("<title>", "utf8"),
          ...ORICON_NEWS_SJIS,
          ...Buffer.from("</title>", "utf8"),
        ],
        "text/html; charset=Shift_JIS",
      ),
    );
    expect(decoded).toBe("<title>オリコンニュース</title>");
  });

  it("decodes an EUC-JP body declared in the Content-Type header", async () => {
    const decoded = await decodeHtmlResponse(
      htmlResponse(
        [
          ...Buffer.from("<p>", "utf8"),
          ...NIHONGO_EUCJP,
          ...Buffer.from("</p>", "utf8"),
        ],
        "text/html; charset=EUC-JP",
      ),
    );
    expect(decoded).toBe("<p>日本語のテスト</p>");
  });

  it("falls back to sniffing the meta charset when the header omits one", async () => {
    const decoded = await decodeHtmlResponse(
      htmlResponse(META_SJIS_HEAD_TITLE, "text/html"),
    );
    expect(decoded).toBe(
      '<meta http-equiv="Content-Type" content="text/html; charset=shift_jis"><title>テスト</title>',
    );
  });

  it("falls back to UTF-8 for unknown charset labels", async () => {
    const text = "<p>hello 日本語</p>";
    const decoded = await decodeHtmlResponse(
      htmlResponse(
        [...Buffer.from(text, "utf8")],
        "text/html; charset=not-a-real-charset",
      ),
    );
    expect(decoded).toBe(text);
  });

  it("passes UTF-8 bodies through unchanged", async () => {
    const text = "<p>日本語</p>";
    const decoded = await decodeHtmlResponse(
      htmlResponse([...Buffer.from(text, "utf8")], "text/html; charset=utf-8"),
    );
    expect(decoded).toBe(text);
  });
});
