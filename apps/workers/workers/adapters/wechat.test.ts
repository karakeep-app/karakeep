import { describe, expect, test } from "vitest";

import { parseWeChatArticleHtml, WECHAT_IMAGE_REFERER } from "./wechat";

describe("parseWeChatArticleHtml", () => {
  test("extracts WeChat metadata and rewrites data-src images", () => {
    const extracted = parseWeChatArticleHtml(
      `
        <!doctype html>
        <html>
          <head>
            <title>Fallback title</title>
            <meta property="og:description" content="OG description" />
            <meta property="og:image" content="/cover.jpeg" />
            <script>var msg_cdn_url = "https://mmbiz.qpic.cn/cover-script.jpeg";</script>
          </head>
          <body>
            <h1 id="activity-name">  Test WeChat Article  </h1>
            <span id="js_name">  Example Account  </span>
            <em id="publish_time">2026-05-07</em>
            <div id="js_content">
              <p>First paragraph</p>
              <img data-src="https://mmbiz.qpic.cn/image-one.webp" />
              <img src="/image-two.jpeg" onclick="alert(1)" />
              <script>alert("remove me")</script>
            </div>
          </body>
        </html>
      `,
      "https://mp.weixin.qq.com/s/example",
    );

    expect(extracted).toMatchObject({
      title: "Test WeChat Article",
      author: "Example Account",
      publisher: "Example Account",
      datePublished: "2026-05-07",
      description: "OG description",
      coverImageUrl: "https://mp.weixin.qq.com/cover.jpeg",
      platform: "wechat",
      imageReferer: WECHAT_IMAGE_REFERER,
    });
    expect(extracted.imageList).toEqual([
      "https://mmbiz.qpic.cn/image-one.webp",
      "https://mp.weixin.qq.com/image-two.jpeg",
    ]);
    expect(extracted.htmlContent).toContain(
      'src="https://mmbiz.qpic.cn/image-one.webp"',
    );
    expect(extracted.htmlContent).not.toContain("data-src");
    expect(extracted.htmlContent).not.toContain("onclick");
    expect(extracted.htmlContent).not.toContain("script");
  });

  test("uses the first content image as cover fallback", () => {
    const extracted = parseWeChatArticleHtml(
      `
        <h1 id="activity-name">Article</h1>
        <div id="js_content">
          <p>Content</p>
          <img data-src="https://mmbiz.qpic.cn/fallback.webp" />
        </div>
      `,
      "https://mp.weixin.qq.com/s/example",
    );

    expect(extracted.coverImageUrl).toBe("https://mmbiz.qpic.cn/fallback.webp");
  });
});
