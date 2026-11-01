import { load } from "cheerio";
import { Response } from "node-fetch";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("network", () => ({
  fetchWithProxy: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
  reddit: {} as { clientId?: string; clientSecret?: string },
  proxy: {},
}));

vi.mock("@karakeep/shared/config", () => ({
  default: mockConfig,
}));

import { fetchWithProxy } from "network";

import metascraperReddit, {
  extractFromShreddit,
  normalizeRedditPostUrl,
  parseRedditChallenge,
} from "./metascraper-reddit";

const mockedFetch = vi.mocked(fetchWithProxy);

const POST_HTML = `
<html><body>
<shreddit-post id="t3_abc123" post-title="vector&lt;T&gt; question" author="alice"
  subreddit-prefixed-name="r/cpp" subreddit-name="cpp"
  created-timestamp="2026-10-01T12:00:00.000000+0000"
  content-href="https://example.com/article" post-type="text" score="42">
  <img src="https://styles.redditmedia.com/t5_x/snoovatar/avatar.png">
  <img src="https://preview.redd.it/pic.jpg?width=640&amp;s=sig">
  <div id="t3_abc123-post-rtjson-content"><p>Hello &amp;amp; <strong>world</strong></p></div>
</shreddit-post>
<shreddit-comment author="bob" score="5" depth="0" thingId="t1_a">
  <div id="t1_a-post-rtjson-content"><p>low score</p></div>
</shreddit-comment>
<shreddit-comment author="carol" score="50" depth="0" thingId="t1_b">
  <div id="t1_b-post-rtjson-content"><p>top comment</p></div>
  <shreddit-comment author="dave" score="99" depth="1" thingId="t1_c">
    <div id="t1_c-post-rtjson-content"><p>nested reply</p></div>
  </shreddit-comment>
</shreddit-comment>
<shreddit-comment author="erin" score="7" depth="0" thingId="t1_d">
  <div id="t1_d-post-rtjson-content"></div>
</shreddit-comment>
</body></html>`;

const postHtmlFor = (id: string) => POST_HTML.replaceAll("abc123", id);

const challengePage = (tokenField: string, tokenValue = "a".repeat(64)) => `
<html><body>
<form hidden method="GET" action="/comments/abc123/">
  <input type="hidden" name="solution" value="">
  <input type="hidden" name="js_challenge" value="1">
  <input type="hidden" name="${tokenField}" value="${tokenValue}">
  <input type="hidden" name="jsc_orig_r" value="">
</form>
<script>(async e=>e+e)("deadbeef")</script>
</body></html>`;

const response = (
  body: string,
  status = 200,
  headers: [string, string][] = [],
) => new Response(body, { status, headers });

const requestHeaders = (callIndex: number) =>
  (mockedFetch.mock.calls[callIndex][1] as { headers: Record<string, string> })
    .headers;

describe("extractFromShreddit", () => {
  test("extracts post fields, body, image and top-level comments", () => {
    const data = extractFromShreddit(load(POST_HTML), "abc123");

    expect(data).toBeDefined();
    expect(data?.title).toBe("vector<T> question");
    expect(data?.author).toBe("alice");
    expect(data?.subredditPrefixed).toBe("r/cpp");
    expect(data?.createdUtc).toBe(1790856000);
    // Real HTML is kept as-is: no entity decoding of the body.
    expect(data?.bodyHtml).toBe(
      "<p>Hello &amp;amp; <strong>world</strong></p>",
    );
    expect(data?.image).toBe("https://preview.redd.it/pic.jpg?width=640&s=sig");
    expect(data?.comments.map((c) => c.author)).toEqual(["bob", "carol"]);
    expect(data?.comments[1]).toMatchObject({
      score: 50,
      body: "top comment",
      bodyHtml: "<p>top comment</p>",
    });
  });

  test("prefers a gallery image, then an i.redd.it content-href", () => {
    const gallery = extractFromShreddit(
      load(`<shreddit-post id="t3_g1" post-title="g" content-href="https://i.redd.it/x.jpg">
        <gallery-carousel><img class="media-lightbox-img" src="https://preview.redd.it/g1.jpg"></gallery-carousel>
      </shreddit-post>`),
      "g1",
    );
    expect(gallery?.image).toBe("https://preview.redd.it/g1.jpg");

    const direct = extractFromShreddit(
      load(
        `<shreddit-post id="t3_d1" post-title="d" content-href="https://i.redd.it/x.jpg"></shreddit-post>`,
      ),
      "d1",
    );
    expect(direct?.image).toBe("https://i.redd.it/x.jpg");
  });

  test("only accepts the shreddit-post matching the requested post id", () => {
    const feed = load(`<html><body>
      <shreddit-post id="t3_first1" post-title="First feed item" author="x"></shreddit-post>
      <shreddit-post id="t3_want22" post-title="Wanted" author="y"></shreddit-post>
    </body></html>`);

    expect(extractFromShreddit(feed, "want22")?.title).toBe("Wanted");
    expect(extractFromShreddit(feed, "nope33")).toBeUndefined();
  });

  test("returns undefined when the page has no shreddit-post", () => {
    expect(
      extractFromShreddit(load("<html><body>blocked</body></html>"), "abc123"),
    ).toBeUndefined();
  });
});

describe("parseRedditChallenge", () => {
  test.each(["jsc_token", "token"])(
    "answers with the %s field name it was served with",
    (field) => {
      const challenge = parseRedditChallenge(challengePage(field));
      expect(challenge).toBeDefined();
      const url = new URL(challenge!.submitUrl);
      expect(url.origin + url.pathname).toBe(
        "https://www.reddit.com/comments/abc123/",
      );
      expect(url.searchParams.get("solution")).toBe("deadbeefdeadbeef");
      expect(url.searchParams.get("js_challenge")).toBe("1");
      expect(url.searchParams.get(field)).toBe("a".repeat(64));
      expect(url.searchParams.get("jsc_orig_r")).toBe("");
      expect(
        url.searchParams.has(field === "token" ? "jsc_token" : "token"),
      ).toBe(false);
    },
  );

  test("returns undefined for a page that is not a challenge", () => {
    expect(
      parseRedditChallenge("<html><body>hello</body></html>"),
    ).toBeUndefined();
  });
});

describe("normalizeRedditPostUrl", () => {
  const canonical = "https://www.reddit.com/comments/abc123/";

  test.each([
    ["slug", "https://www.reddit.com/r/cpp/comments/abc123/some_slug/"],
    ["slugless", "https://www.reddit.com/r/cpp/comments/abc123"],
    ["no subreddit", "https://reddit.com/comments/abc123/"],
    ["fragment", "https://www.reddit.com/r/cpp/comments/abc123/some_slug/#c"],
    ["query", "https://old.reddit.com/r/cpp/comments/abc123/some_slug/?utm=x"],
    [
      "comment permalink",
      "https://www.reddit.com/r/cpp/comments/abc123/some_slug/def456/",
    ],
  ])("%s", (_name, url) => {
    expect(normalizeRedditPostUrl(url)).toBe(canonical);
  });

  test("returns undefined for non-post and non-reddit URLs", () => {
    expect(
      normalizeRedditPostUrl("https://www.reddit.com/r/cpp/"),
    ).toBeUndefined();
    expect(
      normalizeRedditPostUrl("https://evil.example/r/cpp/comments/abc123/"),
    ).toBeUndefined();
    expect(normalizeRedditPostUrl("not a url")).toBeUndefined();
  });
});

describe("anonymous challenge flow", () => {
  const rules = metascraperReddit();
  const readable = rules.readableContentHtml as unknown as (input: {
    url: string;
    htmlDom: ReturnType<typeof load>;
  }) => Promise<string | null | undefined>;
  const emptyDom = () => load("<html><body></body></html>");

  beforeEach(() => {
    mockedFetch.mockReset();
  });

  test("solves the challenge, keeps cookies across the 301 and extracts the post", async () => {
    mockedFetch
      .mockResolvedValueOnce(
        response(challengePage("jsc_token"), 200, [
          ["set-cookie", "edgebucket=eb1; Path=/; Domain=reddit.com"],
        ]),
      )
      .mockResolvedValueOnce(
        response("", 301, [
          ["location", "/r/cpp/comments/abc123/some_slug/"],
          ["set-cookie", "token_v2=tok1; Path=/; Secure"],
          ["set-cookie", "loid=loid1; Path=/"],
          ["set-cookie", "theme=; Max-Age=0; Path=/"],
        ]),
      )
      .mockResolvedValueOnce(response(POST_HTML));

    const html = await readable({
      url: "https://www.reddit.com/r/cpp/comments/abc123/some_slug/#frag",
      htmlDom: emptyDom(),
    });

    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(mockedFetch.mock.calls[0][0]).toBe(
      "https://www.reddit.com/comments/abc123/",
    );
    expect(requestHeaders(0)["Cookie"]).toBeUndefined();

    // The submit goes out with no Cookie header (edgebucket would make it 403).
    const submit = new URL(mockedFetch.mock.calls[1][0]);
    expect(submit.searchParams.get("solution")).toBe("deadbeefdeadbeef");
    expect(submit.searchParams.get("jsc_token")).toBe("a".repeat(64));
    expect(requestHeaders(1)["Cookie"]).toBeUndefined();

    // The page request carries every cookie collected so far.
    expect(mockedFetch.mock.calls[2][0]).toBe(
      "https://www.reddit.com/r/cpp/comments/abc123/some_slug/",
    );
    const cookie = requestHeaders(2)["Cookie"];
    expect(cookie).toContain("token_v2=tok1");
    expect(cookie).toContain("loid=loid1");
    expect(cookie).toContain("edgebucket=eb1");
    expect(cookie).not.toContain("theme");

    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("Top comments");
    expect(html!.indexOf("top comment")).toBeLessThan(
      html!.indexOf("low score"),
    );
    expect(html).not.toContain("nested reply");
  });

  test("handles a submit that answers 200 directly with the rendered page", async () => {
    mockedFetch
      .mockResolvedValueOnce(
        response(challengePage("jsc_token"), 200, [
          ["set-cookie", "edgebucket=eb2; Path=/"],
        ]),
      )
      .mockResolvedValueOnce(
        response(postHtmlFor("xyz789"), 200, [
          ["set-cookie", "token_v2=tok2; Path=/"],
        ]),
      );

    const html = await readable({
      url: "https://www.reddit.com/r/cpp/comments/xyz789/slug/",
      htmlDom: emptyDom(),
    });

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(requestHeaders(1)["Cookie"]).toBeUndefined();
    expect(html).toContain("top comment");
  });

  test("uses the crawled DOM without any request when it has the post", async () => {
    const html = await readable({
      url: "https://www.reddit.com/r/cpp/comments/dom111/slug/",
      htmlDom: load(postHtmlFor("dom111")),
    });

    expect(mockedFetch).not.toHaveBeenCalled();
    expect(html).toContain("top comment");
  });

  test("ignores feed pages: no post data from non-post URLs", async () => {
    const dom = load(
      `<html><body><shreddit-post id="t3_feed01" post-title="Unrelated feed item" author="x"></shreddit-post></body></html>`,
    );
    for (const url of [
      "https://www.reddit.com/r/cpp/",
      "https://www.reddit.com/user/alice/",
      "https://www.reddit.com/",
    ]) {
      for (const rule of [
        rules.readableContentHtml,
        rules.title,
        rules.image,
        rules.author,
        rules.publisher,
        rules.datePublished,
      ]) {
        const fn = rule as unknown as (input: {
          url: string;
          htmlDom: typeof dom;
        }) => Promise<unknown>;
        expect(await fn({ url, htmlDom: dom })).toBeUndefined();
      }
    }
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  test("does not use an unrelated shreddit-post from the crawled DOM", async () => {
    mockedFetch.mockResolvedValueOnce(
      response("<html><body>blocked by network security</body></html>", 403),
    );

    const html = await readable({
      url: "https://www.reddit.com/r/cpp/comments/post44/slug/",
      htmlDom: load(
        `<html><body><shreddit-post id="t3_other9" author="x"></shreddit-post></body></html>`,
      ),
    });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(html).toBeUndefined();
  });

  test("returns the escaped DOM title when Reddit blocks the request", async () => {
    mockedFetch.mockResolvedValueOnce(
      response(
        "<html><body>You have been blocked by network security.</body></html>",
        403,
      ),
    );

    const html = await readable({
      url: "https://www.reddit.com/r/cpp/comments/blk222/slug/",
      htmlDom: load(
        `<html><body><shreddit-title title="vector<T> & friends"></shreddit-title></body></html>`,
      ),
    });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(html).toBe("<p>vector&lt;T&gt; &amp; friends</p>");
  });
});

describe("OAuth path", () => {
  const readable = metascraperReddit()
    .readableContentHtml as unknown as (input: {
    url: string;
    htmlDom: ReturnType<typeof load>;
  }) => Promise<string | null | undefined>;

  const listing = [
    {
      data: {
        children: [
          {
            kind: "t3",
            data: {
              title: "Post",
              author: "alice",
              selftext_html:
                "&lt;div class=&quot;md&quot;&gt;&lt;p&gt;oauth body&lt;/p&gt;&lt;/div&gt;",
            },
          },
        ],
      },
    },
    {
      data: {
        children: [
          {
            kind: "t1",
            data: {
              author: "bob",
              body: "c1",
              body_html: "&lt;p&gt;oauth comment&lt;/p&gt;",
              score: 3,
            },
          },
        ],
      },
    },
  ];

  beforeEach(() => {
    mockedFetch.mockReset();
    mockConfig.reddit = { clientId: "id", clientSecret: "secret" };
  });

  afterEach(() => {
    mockConfig.reddit = {};
  });

  test("requests the canonical post, so comment permalinks share one result", async () => {
    mockedFetch
      .mockResolvedValueOnce(
        response(JSON.stringify({ access_token: "tok", expires_in: 3600 })),
      )
      .mockResolvedValueOnce(response(JSON.stringify(listing)));

    const emptyDom = load("<html><body></body></html>");
    const first = await readable({
      url: "https://www.reddit.com/r/cpp/comments/oau123/slug/cmt999/",
      htmlDom: emptyDom,
    });

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch.mock.calls[1][0]).toBe(
      "https://oauth.reddit.com/comments/oau123.json?sort=top&limit=25&depth=1",
    );
    expect(first).toContain("oauth body");
    expect(first).toContain("oauth comment");

    // A different permalink of the same post reuses the cached result.
    const second = await readable({
      url: "https://www.reddit.com/r/cpp/comments/oau123/slug/other77/",
      htmlDom: emptyDom,
    });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(second).toBe(first);
  });
});
