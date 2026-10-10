import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { parseSubprocessOutputSchema } from "../workers/utils/parseHtmlSubprocessIpc";

function parse(htmlContent: string, metadataOnly = false) {
  return new Promise<ReturnType<typeof parseSubprocessOutputSchema.parse>>(
    (resolve, reject) => {
      const child = execFile(
        process.execPath,
        [
          "--max-old-space-size=512",
          "--import",
          "tsx",
          "scripts/parseHtmlSubprocess.ts",
        ],
        {
          cwd: fileURLToPath(new URL("../", import.meta.url)),
          env: {
            ...process.env,
            DATA_DIR: tmpdir(),
            NEXTAUTH_SECRET: "parser-test",
          },
          timeout: 30_000,
          maxBuffer: 32 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) return reject(new Error(`${error.message}\n${stderr}`));
          try {
            resolve(parseSubprocessOutputSchema.parse(JSON.parse(stdout)));
          } catch (error) {
            reject(error);
          }
        },
      );
      child.stdin!.on("error", reject);
      child.stdin!.end(
        JSON.stringify({
          htmlContent,
          url: "https://example.com/articles/archive",
          jobId: "parser-test",
          metadataOnly,
        }),
      );
    },
  );
}

const paragraph =
  "This archived article explains how a browser saves a page. Its readable text should remain available even when the saved document embeds large fonts and images. The original image bytes should also survive extraction.";

describe("archive parser subprocess", () => {
  test("extracts an image-heavy archive within the default heap and restores resources", async () => {
    // Synthetic data only: never commit a user's authenticated archive.
    const images = Array.from(
      { length: 100 },
      (_, index) => `data:image/png;base64,${index}${"efgh".repeat(13_000)}`,
    );
    const fonts = Array.from(
      { length: 50 },
      (_, index) => `data:font/woff2;base64,${index}${"abcd".repeat(19_000)}`,
    );
    const styles = Array.from(
      { length: 5 },
      (_, group) =>
        `<style>${fonts
          .slice(group * 10, (group + 1) * 10)
          .map(
            (font, index) =>
              `@font-face{font-family:font${group * 10 + index};src:url(${font})}`,
          )
          .join(" ")}</style>`,
    ).join("");
    const html = `<html><head><title>Archived article</title><meta property="og:type" content="article">${styles}</head><body><article><h1>Archived article</h1>${`<p>${paragraph}</p>`.repeat(4)}${images.map((image) => `<img src="${image}" alt="Article illustration">`).join("")}<p>${paragraph} <a href="/reference">Reference</a></p><script>alert('removed')</script></article></body></html>`;
    const result = await parse(html);
    expect(result.readableContent?.content).toContain(paragraph);
    expect(result.readableContent?.content).toContain(images[0]);
    expect(result.readableContent?.content).toContain(images[99]);
    expect(result.readableContent?.content).toContain(
      'href="https://example.com/reference"',
    );
    expect(result.readableContent?.content).not.toContain("<script");
    expect(result.readableContent?.content).not.toContain("data:font/woff2");
    expect(result.readerViewAssessment?.status).toBe("readable");
  }, 40_000);

  test("restores metadata images when readable-content extraction is skipped", async () => {
    const image = `data:image/jpeg;base64,${"abcd".repeat(4096)}`;
    const result = await parse(
      `<html><head><title>Metadata only</title><meta property="og:image" content="${image}"></head><body><p>${paragraph}</p></body></html>`,
      true,
    );
    expect(result.metadata.image).toBe(image);
    expect(result.readableContent).toBeNull();
    expect(result.readerViewAssessment).toBeNull();
  }, 40_000);
});
