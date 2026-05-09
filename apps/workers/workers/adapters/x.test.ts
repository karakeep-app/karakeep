import { describe, expect, test } from "vitest";

import { parseXStatusHtml, X_IMAGE_REFERER } from "./x";

describe("parseXStatusHtml", () => {
  test("extracts X metadata from open graph tags", () => {
    const extracted = parseXStatusHtml(
      `
        <!doctype html>
        <html>
          <head>
            <title>Fallback title / X</title>
            <meta property="og:title" content="Example User on X: &quot;第一段内容&#10;&#10;第二段内容&quot;" />
            <meta property="og:description" content="第一段内容&#10;&#10;第二段内容" />
            <meta property="og:image" content="https://pbs.twimg.com/media/example-one.jpg" />
            <meta name="twitter:image" content="https://pbs.twimg.com/media/example-two.jpg" />
          </head>
          <body></body>
        </html>
      `,
      "https://x.com/example/status/1796912526641512791",
    );

    expect(extracted).toMatchObject({
      title: "Example User: 第一段内容\n\n第二段内容",
      description: "第一段内容\n\n第二段内容",
      author: "Example User",
      publisher: "X",
      datePublished: "2024-06-01T14:31:46.028Z",
      coverImageUrl: "https://pbs.twimg.com/media/example-one.jpg",
      platform: "x",
      imageReferer: X_IMAGE_REFERER,
    });
    expect(extracted.imageList).toEqual([
      "https://pbs.twimg.com/media/example-one.jpg",
      "https://pbs.twimg.com/media/example-two.jpg",
    ]);
    expect(extracted.htmlContent).toContain("<strong>Example User</strong>");
    expect(extracted.htmlContent).toContain("<span>@example</span>");
    expect(extracted.htmlContent).toContain(
      'src="https://pbs.twimg.com/media/example-one.jpg"',
    );
  });

  test("prefers JSON-LD status content when present", () => {
    const extracted = parseXStatusHtml(
      `
        <html>
          <head>
            <meta property="og:title" content="Meta User on X: &quot;Meta text&quot;" />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "SocialMediaPosting",
                "articleBody": "JSON-LD tweet text",
                "datePublished": "2026-05-09T01:02:03.000Z",
                "author": { "@type": "Person", "name": "JSON User" },
                "image": [{ "url": "/json-image.jpg" }]
              }
            </script>
          </head>
        </html>
      `,
      "https://twitter.com/json_user/status/1796912526641512791",
    );

    expect(extracted).toMatchObject({
      title: "JSON User: JSON-LD tweet text",
      description: "JSON-LD tweet text",
      author: "JSON User",
      datePublished: "2026-05-09T01:02:03.000Z",
      coverImageUrl: "https://twitter.com/json-image.jpg",
    });
    expect(extracted.rawExtraction).toMatchObject({
      tweetId: "1796912526641512791",
      handle: "json_user",
      source: "json-ld",
    });
  });
});
