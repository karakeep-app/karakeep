import metascraper from "metascraper";
import metascraperDate from "metascraper-date";
import { describe, expect, it } from "vitest";

import {
  createYoutubeDatePublishedRule,
  isValidMetadataValue,
  parseIsoDateValue,
} from "./htmlMetadata";

describe("isValidMetadataValue", () => {
  it("rejects interstitial phrases as publisher names", () => {
    for (const bad of [
      "Prove your humanity",
      "Just a moment...",
      "Access Denied",
      "Are you a robot?",
      "Log in or sign up to view",
    ]) {
      expect(isValidMetadataValue(bad, { propName: "publisher" })).toBe(false);
    }
    expect(isValidMetadataValue("Reddit", { propName: "publisher" })).toBe(
      true,
    );
  });

  it("rejects numeric and UI-label author values", () => {
    expect(isValidMetadataValue("123456", { propName: "author" })).toBe(false);
    expect(isValidMetadataValue("Changes by", { propName: "author" })).toBe(
      false,
    );
    expect(isValidMetadataValue("Jane Doe", { propName: "author" })).toBe(true);
  });
});

describe("parseIsoDateValue", () => {
  it("normalizes valid ISO timestamps and ignores invalid values", () => {
    expect(parseIsoDateValue("2009-10-24T23:57:33-07:00")).toBe(
      "2009-10-25T06:57:33.000Z",
    );
    expect(parseIsoDateValue("")).toBeUndefined();
    expect(parseIsoDateValue("not-a-date")).toBeUndefined();
    expect(parseIsoDateValue(null)).toBeUndefined();
  });
});

describe("createYoutubeDatePublishedRule", () => {
  it("prefers the video's itemprop publish date over nested comment dateCreated in JSON-LD", async () => {
    const html = `
      <html>
        <head>
          <meta itemprop="datePublished" content="2009-10-24T23:57:33-07:00" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "VideoObject",
              "uploadDate": "2009-10-24T23:57:33-07:00",
              "comment": [
                {
                  "@type": "Comment",
                  "dateCreated": "2026-11-28T02:48:55-08:00",
                  "text": "Recent comment"
                }
              ]
            }
          </script>
        </head>
        <body></body>
      </html>
    `;
    const url = "https://www.youtube.com/watch?v=example";

    const withoutFix = await metascraper([
      metascraperDate({ datePublished: true, dateModified: true }),
    ])({ html, url, validateUrl: false });
    expect(withoutFix.datePublished).toBe("2026-11-28T10:48:55.000Z");

    const withFix = await metascraper([
      createYoutubeDatePublishedRule(),
      metascraperDate({ datePublished: true, dateModified: true }),
    ])({ html, url, validateUrl: false });
    expect(withFix.datePublished).toBe("2009-10-25T06:57:33.000Z");
  });
});
