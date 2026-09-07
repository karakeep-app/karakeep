import { describe, expect, it } from "vitest";

import serverConfig from "@karakeep/shared/config";

import {
  instagramRequestHeaders,
  parseInstagramPage,
  stripAltTextPrefix,
} from "./instagramPage";

/** Wrap a payload the way Instagram embeds it: one data-sjs script among others. */
function page(payload: unknown, extra = ""): string {
  return [
    `<html><head><script type="application/json"  data-content-len="82" data-sjs>{"require":[["x",null,null,[{"foo":1}]]]}</script>`,
    extra,
    `<script type="application/json"  data-content-len="1" data-sjs>${JSON.stringify(payload)}</script>`,
    `</head><body></body></html>`,
  ].join("\n");
}

const carousel = {
  require: [
    [
      "ScheduledServerJS",
      "handle",
      null,
      [
        {
          __bbox: {
            result: {
              data: {
                xdt_api__v1__media__shortcode__web_info: {
                  items: [
                    {
                      code: "ABC123",
                      media_type: 8,
                      taken_at: 1787181237,
                      caption: { text: "the caption" },
                      user: { username: "someuser", full_name: "Some User" },
                      accessibility_caption:
                        "Photo by Some User on August 19, 2026.",
                      image_versions2: {
                        candidates: [{ url: "https://cdn/cover.jpg" }],
                      },
                      carousel_media: [
                        {
                          code: "ABC123",
                          media_type: 1,
                          accessibility_caption:
                            "Photo by Some User on August 19, 2026. May be an image of text that says 'hello'",
                          image_versions2: {
                            candidates: [
                              { url: "https://cdn/1-big.jpg" },
                              { url: "https://cdn/1-small.jpg" },
                            ],
                          },
                        },
                        {
                          code: "ABC123",
                          media_type: 2,
                          accessibility_caption:
                            "Video by Some User on August 19, 2026.",
                          image_versions2: {
                            candidates: [{ url: "https://cdn/2-poster.jpg" }],
                          },
                          video_versions: [{ url: "https://cdn/2.mp4" }],
                        },
                        {
                          code: "ABC123",
                          media_type: 1,
                          image_versions2: {
                            candidates: [{ url: "https://cdn/3.jpg" }],
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    ],
  ],
};

describe("stripAltTextPrefix", () => {
  it("drops the author/date sentence and keeps the description", () => {
    expect(
      stripAltTextPrefix(
        "Photo by Fabiano Carvalho on August 19, 2026. May be an image of text that says 'x'",
      ),
    ).toBe("May be an image of text that says 'x'");
    expect(
      stripAltTextPrefix(
        "Video by Artists Without Autotune on August 07, 2026.",
      ),
    ).toBeNull();
  });

  it("leaves text without the prefix untouched", () => {
    expect(stripAltTextPrefix("a plain description")).toBe(
      "a plain description",
    );
  });
});

describe("parseInstagramPage", () => {
  it("reads a carousel: caption, author, date and every item in order", () => {
    const media = parseInstagramPage(page(carousel));
    expect(media).toEqual({
      code: "ABC123",
      caption: "the caption",
      author: "Some User",
      date: "20260819",
      items: [
        {
          kind: "image",
          imageUrl: "https://cdn/1-big.jpg",
          videoUrl: null,
          altText: "May be an image of text that says 'hello'",
        },
        {
          kind: "video",
          imageUrl: "https://cdn/2-poster.jpg",
          videoUrl: "https://cdn/2.mp4",
          altText: null,
        },
        {
          kind: "image",
          imageUrl: "https://cdn/3.jpg",
          videoUrl: null,
          altText: null,
        },
      ],
    });
  });

  it("reads a single video post as one video item", () => {
    const reel = {
      items: [
        {
          code: "REEL1",
          media_type: 2,
          taken_at: 1786122006,
          caption: { text: "reel caption" },
          user: { username: "artist" },
          image_versions2: { candidates: [{ url: "https://cdn/poster.jpg" }] },
          video_versions: [{ url: "https://cdn/reel.mp4" }],
        },
      ],
    };
    const media = parseInstagramPage(page(reel));
    expect(media?.author).toBe("artist");
    expect(media?.date).toBe("20260807");
    expect(media?.items).toEqual([
      {
        kind: "video",
        imageUrl: "https://cdn/poster.jpg",
        videoUrl: "https://cdn/reel.mp4",
        altText: null,
      },
    ]);
  });

  it("returns null for the empty shell served to non-browser clients", () => {
    expect(
      parseInstagramPage(page({ require: [["x", null, null, [{ a: 1 }]]] })),
    ).toBeNull();
    expect(parseInstagramPage("<html><body>login</body></html>")).toBeNull();
  });

  it("skips a block that mentions media_type but is not valid JSON", () => {
    const broken = `<script type="application/json" data-sjs>{"media_type":8,</script>`;
    expect(parseInstagramPage(page(carousel, broken))).not.toBeNull();
  });
});

describe("instagramRequestHeaders", () => {
  it("overlays CRAWLER_INSTAGRAM_HEADERS_JSON on the defaults", () => {
    const saved = serverConfig.crawler.instagramHeaders;
    serverConfig.crawler.instagramHeaders = {
      "User-Agent": "UA/2",
      "X-Extra": "1",
    };
    try {
      const h = instagramRequestHeaders();
      expect(h["User-Agent"]).toBe("UA/2");
      expect(h["X-Extra"]).toBe("1");
      expect(h["Sec-Fetch-Mode"]).toBe("navigate");
    } finally {
      serverConfig.crawler.instagramHeaders = saved;
    }
  });
});
