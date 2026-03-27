import { load } from "cheerio";
import { describe, expect, test } from "vitest";

import { __private } from "./metascraper-twitter";

describe("extractFromDom", () => {
  test("ignores nested quoted tweets when classifying thread and replies", () => {
    const html = `
      <div data-testid="tweet">
        <a role="link" href="/main">Main User</a>
        <a role="link" href="/main">@main</a>
        <a href="/main/status/200">Mar 2</a>
        <time datetime="2026-03-22T10:00:00.000Z"></time>
        <div data-testid="tweetText">Main tweet text</div>
        <div data-testid="tweet">
          <a role="link" href="/quoted">Quoted User</a>
          <a role="link" href="/quoted">@quoted</a>
          <a href="/quoted/status/250">Quoted</a>
          <time datetime="2026-03-22T10:01:00.000Z"></time>
          <div data-testid="tweetText">Quoted tweet text</div>
        </div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/reply">Reply User</a>
        <a role="link" href="/reply">@reply</a>
        <a href="/reply/status/300">Mar 3</a>
        <time datetime="2026-03-22T10:02:00.000Z"></time>
        <div data-testid="tweetText">Actual reply</div>
      </div>
    `;

    const content = __private.extractFromDom(
      load(html),
      "https://x.com/main/status/200",
    );

    expect(content).toContain("Main tweet text");
    expect(content).toContain("Actual reply");
    expect(content).not.toContain("Quoted tweet text");
    expect(content).not.toContain("https://x.com/quoted/status/250");
  });
});

describe("extractTitleFromTweetDom", () => {
  test("extracts main tweet text as title", () => {
    const html = `
      <div data-testid="tweet">
        <a href="/user/status/100">link</a>
        <div data-testid="tweetText">This is a test tweet about something interesting</div>
      </div>
    `;
    const result = __private.extractTitleFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(result).toBe("This is a test tweet about something interesting");
  });

  test("truncates long tweet text with ellipsis", () => {
    const longText = "A".repeat(150);
    const html = `
      <div data-testid="tweet">
        <a href="/user/status/100">link</a>
        <div data-testid="tweetText">${longText}</div>
      </div>
    `;
    const result = __private.extractTitleFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(result).toHaveLength(101);
    expect(result!.endsWith("…")).toBe(true);
  });

  test("returns undefined when no tweet elements", () => {
    const html = `<div>No tweets here</div>`;
    const result = __private.extractTitleFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(result).toBeUndefined();
  });
});

describe("extractTitleFromMeta", () => {
  test('parses "Author on X: tweet text" format', () => {
    const html = `<meta property="og:title" content='John Doe on X: "Check out this cool thing I built"' />`;
    const result = __private.extractTitleFromMeta(load(html));
    expect(result).toBe("Check out this cool thing I built");
  });

  test('returns undefined for generic "X" title', () => {
    const html = `<meta property="og:title" content="X" />`;
    const result = __private.extractTitleFromMeta(load(html));
    expect(result).toBeUndefined();
  });

  test("returns undefined when no og:title", () => {
    const html = `<div>no meta</div>`;
    const result = __private.extractTitleFromMeta(load(html));
    expect(result).toBeUndefined();
  });

  test("handles @handle on X format", () => {
    const html = `<meta property="og:title" content="@someuser on X" />`;
    const result = __private.extractTitleFromMeta(load(html));
    expect(result).toBe("@someuser on X");
  });
});

describe("extractImageFromTweetDom", () => {
  test("extracts image from main tweet and normalizes to small", () => {
    const html = `
      <div data-testid="tweet">
        <a href="/user/status/100">link</a>
        <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/abc?format=jpg&name=900x900" /></div>
      </div>
    `;
    const result = __private.extractImageFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(result).toBe(
      "https://pbs.twimg.com/media/abc?format=jpg&name=small",
    );
  });

  test("returns undefined when no images", () => {
    const html = `
      <div data-testid="tweet">
        <a href="/user/status/100">link</a>
        <div data-testid="tweetText">Text only tweet</div>
      </div>
    `;
    const result = __private.extractImageFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(result).toBeUndefined();
  });
});

describe("extractImageFromMeta", () => {
  test("returns og:image when not the default", () => {
    const html = `<meta property="og:image" content="https://pbs.twimg.com/media/abc.jpg" />`;
    const result = __private.extractImageFromMeta(load(html));
    expect(result).toBe("https://pbs.twimg.com/media/abc.jpg");
  });

  test("returns undefined for default X og:image", () => {
    const html = `<meta property="og:image" content="https://abs.twimg.com/rweb/ssr/default/v2/og/image.png" />`;
    const result = __private.extractImageFromMeta(load(html));
    expect(result).toBeUndefined();
  });
});

describe("extractAuthorFromTweetDom", () => {
  test("extracts author from UserAvatar-Container", () => {
    const html = `
      <div data-testid="tweet">
        <div data-testid="UserAvatar-Container-johndoe"></div>
        <div data-testid="tweetText">Hello world</div>
      </div>
    `;
    const result = __private.extractAuthorFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(result).toBe("johndoe");
  });

  test("falls back to @handle link", () => {
    const html = `
      <div data-testid="tweet">
        <a role="link" href="/johndoe">John Doe</a>
        <a role="link" href="/johndoe">@johndoe</a>
        <div data-testid="tweetText">Hello world</div>
      </div>
    `;
    const result = __private.extractAuthorFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(result).toBe("johndoe");
  });

  test("returns undefined when no tweet elements", () => {
    const html = `<div>no tweets</div>`;
    const result = __private.extractAuthorFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(result).toBeUndefined();
  });
});

describe("extractAuthorFromMeta", () => {
  test("parses author from og:title", () => {
    const html = `<meta property="og:title" content='John Doe on X: "some tweet"' />`;
    const result = __private.extractAuthorFromMeta(load(html));
    expect(result).toBe("John Doe");
  });

  test("parses @handle on X format", () => {
    const html = `<meta property="og:title" content="@johndoe on X" />`;
    const result = __private.extractAuthorFromMeta(load(html));
    expect(result).toBe("johndoe");
  });

  test('returns undefined for generic "X"', () => {
    const html = `<meta property="og:title" content="X" />`;
    const result = __private.extractAuthorFromMeta(load(html));
    expect(result).toBeUndefined();
  });
});

describe("pre-scroll main tweet injection", () => {
  test("findMainTweetEl prefers pre-scroll injected tweet over post-scroll heuristics", () => {
    // Simulate post-scroll HTML where the main tweet lost its status link,
    // plus a pre-scroll main tweet injected by the crawler.
    const html = `
      <div data-testid="tweet">
        <a role="link" href="/kyle_e_walker">Kyle Walker</a>
        <a role="link" href="/kyle_e_walker">@kyle_e_walker</a>
        <div data-testid="tweetText">Main tweet (post-scroll, no status link)</div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/kyle_e_walker">Kyle Walker</a>
        <a role="link" href="/kyle_e_walker">@kyle_e_walker</a>
        <a href="/kyle_e_walker/status/999">link</a>
        <div data-testid="tweetText">Self-reply</div>
      </div>
      <div data-karakeep-main-tweet="pre-scroll" style="display:none">
        <div data-testid="tweet">
          <a role="link" href="/kyle_e_walker">Kyle Walker</a>
          <a role="link" href="/kyle_e_walker">@kyle_e_walker</a>
          <a href="/kyle_e_walker/status/123">link</a>
          <div data-testid="tweetText">Main tweet (pre-scroll, correct)</div>
          <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/correct_banner.jpg" /></div>
        </div>
      </div>
    `;
    const $ = load(html);
    const url = "https://x.com/kyle_e_walker/status/123";

    // Title should come from the pre-scroll main tweet
    const title = __private.extractTitleFromTweetDom($, url);
    expect(title).toBe("Main tweet (pre-scroll, correct)");

    // Image should come from the pre-scroll main tweet
    const image = __private.extractImageFromTweetDom($, url);
    expect(image).toContain("correct_banner");

    // Author should come from the pre-scroll main tweet
    const author = __private.extractAuthorFromTweetDom($, url);
    expect(author).toBe("kyle_e_walker");
  });

  test("falls back to status ID matching when no pre-scroll container", () => {
    const html = `
      <div data-testid="tweet">
        <a role="link" href="/user">@user</a>
        <a href="/user/status/100">link</a>
        <div data-testid="tweetText">Main tweet</div>
      </div>
    `;
    const title = __private.extractTitleFromTweetDom(
      load(html),
      "https://x.com/user/status/100",
    );
    expect(title).toBe("Main tweet");
  });

  test("extractFromDom uses first tweet by author when status ID match fails", () => {
    // After scrolling, the main tweet may lose its status link.
    // The fallback should pick the FIRST tweet by the URL's author,
    // not one without a tweetUrl (the old broken heuristic).
    const html = `
      <div data-testid="tweet">
        <a role="link" href="/kyle">@kyle</a>
        <a href="/kyle/status/200">Mar 1</a>
        <time datetime="2026-03-01T10:00:00.000Z"></time>
        <div data-testid="tweetText">Main tweet text</div>
        <div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/ext_tw_video_thumb/main_poster.jpg"></video></div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/kyle">@kyle</a>
        <a href="/kyle/status/201">Mar 1</a>
        <time datetime="2026-03-01T10:01:00.000Z"></time>
        <div data-testid="tweetText">Self-reply with link card</div>
        <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/card_img/wrong_card.jpg" /></div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/other">@other</a>
        <a href="/other/status/300">Mar 2</a>
        <time datetime="2026-03-02T10:00:00.000Z"></time>
        <div data-testid="tweetText">Reply from someone else</div>
      </div>
    `;
    const $ = load(html);
    // Use a status ID (999) that doesn't match any link in the DOM
    const url = "https://x.com/kyle/status/999";

    const content = __private.extractFromDom($, url);
    // Main tweet should be the first @kyle tweet (tweet 0), not tweet 1
    expect(content).toContain("Main tweet text");
    // Self-reply should be in replies section, not main
    expect(content).toContain("Self-reply with link card");
    // Other reply should also be present
    expect(content).toContain("Reply from someone else");
    // The "Replies" heading should appear (both self-reply and other reply are after main)
    expect(content).toContain("Replies");
  });

  test("deduplicates the post-scroll main tweet when a pre-scroll copy is injected", () => {
    const html = `
      <div data-testid="tweet">
        <a role="link" href="/kyle">@kyle</a>
        <time datetime="2026-03-01T10:00:00.000Z"></time>
        <div data-testid="tweetText">Main tweet text</div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/reply">@reply</a>
        <a href="/reply/status/300">Mar 2</a>
        <time datetime="2026-03-02T10:00:00.000Z"></time>
        <div data-testid="tweetText">Reply from someone else</div>
      </div>
      <div data-karakeep-main-tweet="pre-scroll" style="display:none">
        <div data-testid="tweet">
          <a role="link" href="/kyle">@kyle</a>
          <a href="/kyle/status/200">Mar 1</a>
          <time datetime="2026-03-01T10:00:00.000Z"></time>
          <div data-testid="tweetText">Main tweet text</div>
        </div>
      </div>
    `;

    const content = __private.extractFromDom(
      load(html),
      "https://x.com/kyle/status/200",
    );

    expect(content?.match(/Main tweet text/g)).toHaveLength(1);
    expect(content).toContain("Reply from someone else");
  });
});

describe("fallback chain integration", () => {
  test("when DOM has no tweets, meta tag helpers extract useful data", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content='Troy Hua on X: "Our 4B Model Remembers 70 Harry Potter Series"' />
          <meta property="og:image" content="https://pbs.twimg.com/media/HEHV7G2bgAAA7mz?format=jpg&name=900x900" />
        </head>
        <body><div id="react-root"></div></body>
      </html>
    `;
    const $ = load(html);
    const url = "https://x.com/troyhua/status/2036143873270153526";

    // DOM extraction returns undefined (no rendered tweets)
    expect(__private.extractFromDom($, url)).toBeUndefined();

    // But meta fallbacks work
    expect(__private.extractTitleFromMeta($)).toBe(
      "Our 4B Model Remembers 70 Harry Potter Series",
    );
    expect(__private.extractImageFromMeta($)).toBe(
      "https://pbs.twimg.com/media/HEHV7G2bgAAA7mz?format=jpg&name=900x900",
    );
    expect(__private.extractAuthorFromMeta($)).toBe("Troy Hua");
  });

  test("when DOM has no tweets and og:title is generic X, returns undefined", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="X" />
          <meta property="og:image" content="https://abs.twimg.com/rweb/ssr/default/v2/og/image.png" />
        </head>
        <body><div id="react-root"></div></body>
      </html>
    `;
    const $ = load(html);

    expect(__private.extractTitleFromMeta($)).toBeUndefined();
    expect(__private.extractImageFromMeta($)).toBeUndefined();
    expect(__private.extractAuthorFromMeta($)).toBeUndefined();
  });

  test("does not emit a broken canonical tweet URL when authorHandle is missing", () => {
    const html = `
      <div data-testid="tweet">
        <a href="/user/status/100">Mar 1</a>
        <time datetime="2026-03-01T10:00:00.000Z"></time>
        <div data-testid="tweetText">Main tweet text</div>
      </div>
    `;

    const content = __private.extractFromDom(
      load(html),
      "https://x.com/user/status/100",
    );

    expect(content).toContain("Main tweet text");
    expect(content).not.toContain('href="https://x.com/status/100"');
  });
});

describe("extractArticleWithReplies", () => {
  test("extracts article body and reply tweets from a /status/ page", () => {
    const html = `
      <div data-testid="twitter-article-title">My Article Title</div>
      <div data-testid="twitterArticleRichTextView">
        <div data-block="true"><span>First paragraph of the article.</span></div>
        <div data-block="true"><span>Second paragraph with details.</span></div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/author">Author Name</a>
        <a role="link" href="/author">@author</a>
        <a href="/author/status/100">Mar 1</a>
        <time datetime="2026-03-22T10:00:00.000Z"></time>
        <div data-testid="tweetText">Posted my article</div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/replier">Reply Person</a>
        <a role="link" href="/replier">@replier</a>
        <a href="/replier/status/200">Mar 2</a>
        <time datetime="2026-03-22T11:00:00.000Z"></time>
        <div data-testid="tweetText">Great article!</div>
      </div>
    `;

    const content = __private.extractArticleWithReplies(
      load(html),
      "https://x.com/author/status/100",
    );

    expect(content).toContain("My Article Title");
    expect(content).toContain("First paragraph of the article.");
    expect(content).toContain("Second paragraph with details.");
    expect(content).toContain("Replies");
    expect(content).toContain("Great article!");
    expect(content).toContain("Reply Person");
  });

  test("returns article body without replies when none exist", () => {
    const html = `
      <div data-testid="twitter-article-title">Solo Article</div>
      <div data-testid="twitterArticleRichTextView">
        <div data-block="true"><span>Article content here.</span></div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/author">Author</a>
        <a role="link" href="/author">@author</a>
        <a href="/author/status/100">Mar 1</a>
        <time datetime="2026-03-22T10:00:00.000Z"></time>
        <div data-testid="tweetText">Check out my article</div>
      </div>
    `;

    const content = __private.extractArticleWithReplies(
      load(html),
      "https://x.com/author/status/100",
    );

    expect(content).toContain("Solo Article");
    expect(content).toContain("Article content here.");
    expect(content).not.toContain("Replies");
  });

  test("escapes article text and sanitizes links", () => {
    const html = `
      <div data-testid="twitter-article-title">My &lt;Title&gt;</div>
      <div data-testid="twitterArticleRichTextView">
        <div data-block="true">
          <span>Paragraph with </span>
          <a href="/author/status/100">relative link</a>
        </div>
        <div data-block="true">
          <a href="javascript:alert(1)">unsafe link</a>
        </div>
      </div>
      <div data-testid="tweet">
        <a role="link" href="/author">Author</a>
        <a role="link" href="/author">@author</a>
        <a href="/author/status/100">Mar 1</a>
        <time datetime="2026-03-22T10:00:00.000Z"></time>
        <div data-testid="tweetText">Check out my article</div>
      </div>
    `;

    const content = __private.extractArticleWithReplies(
      load(html),
      "https://x.com/author/status/100",
    );

    expect(content).toContain("<h1>My &lt;Title&gt;</h1>");
    expect(content).toContain('href="https://x.com/author/status/100"');
    expect(content).not.toContain("javascript:alert(1)");
  });

  test("extracts code blocks from flattened text (headless Chrome rendering)", () => {
    const html = `
      <div data-testid="twitter-article-title">Code Article</div>
      <div data-testid="twitterArticleRichTextView">
        <div data-block="true"><span>Here is an example:</span></div>
        <section data-block="true"><div><span>plaintext# Project: Acme API

## Commands
npm run dev</span></div></section>
        <div data-block="true"><span>And some JSON config:</span></div>
        <section data-block="true"><div><span>json{
  "name": "test"
}</span></div></section>
        <div data-block="true"><span>Normal paragraph after code.</span></div>
      </div>
    `;

    const content = __private.extractArticleWithReplies(
      load(html),
      "https://x.com/user/article/100",
    );

    // Code blocks should be wrapped in <pre><code>
    expect(content).toContain("<pre><code");
    expect(content).toContain('language-plaintext"');
    expect(content).toContain("# Project: Acme API");
    expect(content).toContain('language-json"');
    expect(content).toContain("&quot;name&quot;: &quot;test&quot;");
    // Regular paragraphs should still be <p>
    expect(content).toContain("<p>Here is an example:</p>");
    expect(content).toContain("<p>Normal paragraph after code.</p>");
    // Language label should NOT appear in code content
    expect(content).not.toContain(">plaintext#");
    expect(content).not.toContain(">json{");
  });

  test("extracts code blocks with pre/code elements (authenticated Chrome rendering)", () => {
    const html = `
      <div data-testid="twitter-article-title">Code Article</div>
      <div data-testid="twitterArticleRichTextView">
        <div data-block="true"><span>Example:</span></div>
        <section data-block="true">
          <div data-testid="markdown-code-block">
            <div>plaintext</div>
            <pre><code><span># Project: Acme API</span></code></pre>
          </div>
        </section>
      </div>
    `;

    const content = __private.extractArticleWithReplies(
      load(html),
      "https://x.com/user/article/100",
    );

    expect(content).toContain("<pre><code");
    expect(content).toContain('language-plaintext"');
    expect(content).toContain("# Project: Acme API");
    expect(content).not.toContain(">plaintext#");
  });

  test("returns undefined when no article DOM is present", () => {
    const html = `
      <div data-testid="tweet">
        <a href="/user/status/100">link</a>
        <div data-testid="tweetText">Just a tweet</div>
      </div>
    `;

    const content = __private.extractArticleWithReplies(
      load(html),
      "https://x.com/user/status/100",
    );

    expect(content).toBeUndefined();
  });
});
