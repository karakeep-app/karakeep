import type { CheerioAPI } from "cheerio";
import type { Rules, RulesOptions } from "metascraper";

import { extractXStatusId } from "../workers/utils/xStatusPage";
import { domainFromUrl } from "./utils";

const MAX_REPLIES = 20;

/**
 * Escape HTML special characters to prevent XSS when inserting
 * user-controlled text into HTML strings.
 */
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const sanitizeUrl = (url: string, baseUrl = "https://x.com"): string | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed =
      trimmed.startsWith("/") && !trimmed.startsWith("//")
        ? new URL(trimmed, baseUrl)
        : new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

function getTopLevelTweetEls($: CheerioAPI) {
  // Collect all top-level tweet elements (skip nested/quoted tweets and
  // the pre-scroll main tweet injected by the crawler for metadata).
  const allTweets = $(
    '[data-testid="tweet"], [data-testid="simpleTweet"]',
  ).filter(
    (_, el) =>
      $(el).parents('[data-testid="tweet"], [data-testid="simpleTweet"]')
        .length === 0 &&
      $(el).closest("[data-karakeep-main-tweet]").length === 0,
  );

  // Tweets inside the bottom-scroll reply container were already
  // filtered (Discover More boundary applied at injection time).
  // Separate them so we can skip the boundary filter below.
  const injectedReplies = new Set<object>();
  allTweets.each((_, el) => {
    if ($(el).closest("[data-karakeep-replies]").length > 0) {
      injectedReplies.add(el);
    }
  });

  // Find the "Discover more" heading — tweets after it are unrelated
  // recommendations, not replies.
  let discoverBoundary: ReturnType<CheerioAPI> | null = null;
  $('[role="heading"]').each((_, el) => {
    if (!discoverBoundary && $(el).text().trim().startsWith("Discover more")) {
      discoverBoundary = $(el);
    }
  });

  if (!discoverBoundary) return allTweets;

  // Build a Set of the actual DOM nodes for fast lookup.
  const tweetNodes = new Set<object>();
  allTweets.each((_, el) => {
    tweetNodes.add(el);
  });

  // Walk through all elements in document order, collecting tweets
  // that appear before the Discover More heading.
  const tweetsBeforeBoundary = new Set<object>();
  const boundaryNode = discoverBoundary[0];
  let foundBoundary = false;
  $("*").each((_, el) => {
    if (foundBoundary) return;
    if (el === boundaryNode) {
      foundBoundary = true;
      return;
    }
    if (tweetNodes.has(el)) {
      tweetsBeforeBoundary.add(el);
    }
  });

  // Include tweets before boundary + all injected reply tweets
  // (already filtered at injection time).
  return allTweets.filter(
    (_, el) => tweetsBeforeBoundary.has(el) || injectedReplies.has(el),
  );
}

interface ExtractedTweet {
  authorName: string;
  authorHandle: string;
  timestamp: string;
  textHtml: string;
  images: string[];
  hasVideo: boolean;
  isMainTweet: boolean;
  tweetUrl: string | null;
}

/** Extract the tweet/status ID from a Twitter URL. */
const extractTweetId = (url: string): string | undefined =>
  extractXStatusId(url) ?? undefined;

/**
 * Extract the username from a Twitter URL path.
 * e.g. "https://x.com/kyle_e_walker/status/123" -> "kyle_e_walker"
 */
const extractTweetUsername = (url: string): string | undefined => {
  try {
    return new URL(url).pathname.match(/^\/(\w+)\/status\//)?.[1];
  } catch {
    return undefined;
  }
};

/**
 * Rewrite relative hrefs (e.g. /user, /hashtag/foo) to absolute X.com URLs.
 * Tweet text markup from X uses relative paths for mentions, hashtags,
 * and profile links — copying them verbatim would make them resolve
 * against the Karakeep domain in reader view.
 */
const absolutizeXLinks = (html: string, $: CheerioAPI): string => {
  // Parse the fragment, rewrite hrefs, return serialized HTML.
  const fragment = $.load(html, null, false);
  fragment("a[href]").each((_, el) => {
    const href = fragment(el).attr("href") ?? "";
    if (href.startsWith("/") && !href.startsWith("//")) {
      fragment(el).attr("href", `https://x.com${href}`);
    }
  });
  return fragment.html() ?? html;
};

/**
 * Extract data from a single tweet element.
 */
const extractSingleTweet = (
  el: ReturnType<CheerioAPI>,
  $: CheerioAPI,
  mainTweetId: string | undefined,
): ExtractedTweet | null => {
  // Clone and strip nested tweets (quoted tweets) so their metadata
  // doesn't bleed into the parent tweet's extraction.
  const contentRoot = el.clone();
  contentRoot
    .find('[data-testid="tweet"], [data-testid="simpleTweet"]')
    .remove();

  // Extract tweet text — absolutize relative X.com links and convert
  // newlines in text nodes to <br> so they survive outside Twitter's CSS
  // (which uses white-space: pre-wrap).
  const tweetTextEl = contentRoot.find('[data-testid="tweetText"]').first();
  const rawTextHtml = tweetTextEl.html()?.trim() ?? "";
  const textHtml = rawTextHtml
    ? absolutizeXLinks(rawTextHtml, $).replace(/\n/g, "<br>")
    : "";

  // Extract author handle - look for links that match /@handle pattern
  let authorHandle = "";
  let authorName = "";

  // Find the user name section - typically the first group of links in the tweet header
  // The handle link points to /<username> and contains text starting with @
  contentRoot.find('a[role="link"]').each((_, linkEl) => {
    const href = $(linkEl).attr("href") ?? "";
    const text = $(linkEl).text().trim();
    if (!authorHandle && text.startsWith("@") && /^\/\w+$/.test(href)) {
      authorHandle = text;
    }
  });

  // Author name: look for links to the user profile that don't start with @
  if (authorHandle) {
    const handlePath = authorHandle.replace("@", "/");
    contentRoot
      .find(`a[role="link"][href="${handlePath}"]`)
      .each((_, linkEl) => {
        const text = $(linkEl).text().trim();
        if (!authorName && text && !text.startsWith("@")) {
          authorName = text;
        }
      });
  }

  // Extract timestamp
  const timeEl = contentRoot.find("time").first();
  const timestamp = timeEl.attr("datetime") ?? "";

  // Extract images
  const images: string[] = [];
  contentRoot.find('[data-testid="tweetPhoto"] img').each((_, imgEl) => {
    const src = $(imgEl).attr("src");
    if (src) {
      images.push(src);
    }
  });

  // Check for video
  const hasVideo = contentRoot.find('[data-testid="videoPlayer"]').length > 0;

  // Determine if this is the main tweet by checking for a link containing the status ID
  let isMainTweet = false;
  let tweetUrl: string | null = null;
  if (mainTweetId) {
    contentRoot.find(`a[href*="/status/${mainTweetId}"]`).each((_, linkEl) => {
      const href = $(linkEl).attr("href") ?? "";
      if (href.includes(`/status/${mainTweetId}`)) {
        isMainTweet = true;
      }
    });
  }

  // Try to find a status link for this tweet (for non-main tweets)
  if (!isMainTweet) {
    contentRoot.find('a[href*="/status/"]').each((_, linkEl) => {
      const href = $(linkEl).attr("href") ?? "";
      // Match links like /username/status/12345 (with optional query params)
      if (!tweetUrl && /^\/\w+\/status\/\d+/.test(href)) {
        tweetUrl = sanitizeUrl(href, "https://x.com");
      }
    });
  } else if (authorHandle) {
    tweetUrl = `https://x.com${authorHandle.replace("@", "/")}${mainTweetId ? `/status/${mainTweetId}` : ""}`;
  }

  // Skip tweets with no meaningful content
  if (!textHtml && images.length === 0 && !hasVideo) {
    return null;
  }

  return {
    authorName,
    authorHandle,
    timestamp,
    textHtml,
    images,
    hasVideo,
    isMainTweet,
    tweetUrl,
  };
};

/**
 * Format an ISO timestamp into a human-readable date string.
 */
const formatTimestamp = (iso: string): string => {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

/**
 * Build HTML for a single tweet.
 */
const buildTweetHtml = (tweet: ExtractedTweet): string => {
  const parts: string[] = [];

  // Author header with link to tweet (timestamp links to the tweet URL, matching Twitter's pattern)
  const authorParts: string[] = [];
  if (tweet.authorName) {
    authorParts.push(`<strong>${escapeHtml(tweet.authorName)}</strong>`);
  }
  if (tweet.authorHandle) {
    authorParts.push(escapeHtml(tweet.authorHandle));
  }
  if (tweet.timestamp) {
    const formatted = formatTimestamp(tweet.timestamp);
    if (tweet.tweetUrl) {
      authorParts.push(
        `<a href="${escapeHtml(tweet.tweetUrl)}">${formatted}</a>`,
      );
    } else {
      authorParts.push(formatted);
    }
  }
  if (authorParts.length > 0) {
    parts.push(`<p>${authorParts.join(" · ")}</p>`);
  }

  // Tweet text
  if (tweet.textHtml) {
    parts.push(`<div>${tweet.textHtml}</div>`);
  }

  // Images
  for (const src of tweet.images) {
    const safeSrc = sanitizeUrl(src);
    if (safeSrc) {
      parts.push(`<img src="${escapeHtml(safeSrc)}" />`);
    }
  }

  // Video placeholder
  if (tweet.hasVideo) {
    const link = tweet.tweetUrl ?? "#";
    parts.push(`<p><a href="${link}">[Video]</a></p>`);
  }

  return parts.join("\n");
};

/**
 * Build HTML for an inline video poster linking back to X.
 */
const buildVideoHtml = (poster: string, pageUrl?: string): string => {
  const linkUrl = pageUrl ? (sanitizeUrl(pageUrl) ?? "#") : "#";
  const posterUrl = sanitizeUrl(poster);
  if (!posterUrl) return "";
  return (
    `<a href="${escapeHtml(linkUrl)}" rel="noopener noreferrer" target="_blank">` +
    `<video poster="${escapeHtml(posterUrl)}" controls preload="none"></video>` +
    `</a>`
  );
};

/**
 * Check if a URL is an X article page.
 */
const isArticleUrl = (url: string): boolean => {
  try {
    return /\/[\w]+\/article\/\d+/.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

/**
 * Check if the page DOM contains an X article, regardless of URL.
 * When authenticated, the /status/ page may render the article inline.
 */
const hasArticleDom = ($: CheerioAPI): boolean =>
  $('[data-testid="twitterArticleReadView"]').length > 0 ||
  $('[data-testid="twitter-article-title"]').length > 0;

/**
 * Extract content from an X article page.
 * X articles use a Draft.js-based rich text editor with specific data-testid attributes:
 * - [data-testid="twitter-article-title"] — article title
 * - [data-testid="twitterArticleRichTextView"] — article container
 * - [data-testid="longformRichTextComponent"] — rich text body
 * - [data-block="true"] — individual text blocks within the rich text
 * - [data-testid="tweetPhoto"] img — embedded images (interleaved with text)
 * - [data-testid="tweet"] — embedded tweets (interleaved with text)
 *
 * Content elements are interleaved in the DOM — we walk them in order
 * to preserve the article's reading flow.
 */
const extractArticleFromDom = (
  $: CheerioAPI,
  pageUrl?: string,
): string | undefined => {
  const parts: string[] = [];

  // Extract title (use .first() to avoid duplicates when pre-scroll
  // article DOM was injected alongside the post-scroll DOM)
  const titleEl = $('[data-testid="twitter-article-title"]').first();
  if (titleEl.length > 0) {
    const titleText = titleEl.text().trim();
    if (titleText) {
      parts.push(`<h1>${escapeHtml(titleText)}</h1>`);
    }
  }

  // Banner image — the first tweetPhoto inside the article's parent tweet
  // but NOT inside the rich text view (those are content images).
  // Scope to the tweet containing the article to avoid reply tweet images.
  const articleContainer = $(
    '[data-testid="twitterArticleRichTextView"]',
  ).closest('[data-testid="tweet"], [data-testid="simpleTweet"]');
  const bannerSearchRoot =
    articleContainer.length > 0 ? articleContainer : $.root();
  let firstPhoto = bannerSearchRoot
    .find('[data-testid="tweetPhoto"] img')
    .filter(
      (_, el) =>
        $(el).closest('[data-testid="twitterArticleRichTextView"]').length ===
        0,
    )
    .first();
  if (firstPhoto.length === 0) {
    // Fallback: first tweetPhoto on the page (pre-scroll injection case)
    firstPhoto = $('[data-testid="tweetPhoto"] img').first();
  }
  if (firstPhoto.length > 0) {
    const src = firstPhoto.attr("src");
    const safeSrc = src ? sanitizeUrl(src) : null;
    if (safeSrc) {
      parts.push(`<img src="${escapeHtml(safeSrc)}" />`);
    }
  }

  // Walk all descendants of the rich text view in DOM order.
  // Track seen elements to avoid duplicates from nested matches.
  // Exclude the pre-scroll main tweet container — it may contain a
  // duplicate richTextView injected by the crawler for metadata.
  const richView = $('[data-testid="twitterArticleRichTextView"]')
    .filter((_, el) => $(el).closest("[data-karakeep-main-tweet]").length === 0)
    .first();
  if (richView.length === 0) {
    return parts.length > 0 ? parts.join("\n") : undefined;
  }

  const seen = new Set<object>();

  richView.find("*").each((_, el) => {
    if (seen.has(el)) return;

    const testId = $(el).attr("data-testid") ?? "";
    const isBlock = $(el).attr("data-block") === "true";

    if (isBlock) {
      seen.add(el);
      // Skip blocks that contain video players or scrubbers — their
      // text content is video metadata (e.g. "0:00 / 0:24"), not
      // article prose.  The video is extracted separately below.
      if (
        $(el).find('[data-testid="videoPlayer"]').length > 0 ||
        $(el).find('[data-testid="scrubber"]').length > 0
      ) {
        // Mark all descendants as seen so the videoPlayer handler
        // doesn't fire again for the same video.
        $(el)
          .find("*")
          .each((_, descendant) => {
            seen.add(descendant);
          });
        const poster = $(el).find("video").attr("poster");
        if (poster) {
          const videoHtml = buildVideoHtml(poster, pageUrl);
          if (videoHtml) {
            parts.push(videoHtml);
          }
        }
        return;
      }
      // Handle code blocks — X renders them inside data-block sections
      // either as div[data-testid="markdown-code-block"] > div (lang) + pre > code,
      // or (in some Chromium versions) as flattened text where the language
      // label is concatenated with the code content.
      {
        const codeBlockEl = $(el).find('[data-testid="markdown-code-block"]');
        const preEl =
          codeBlockEl.length > 0 ? codeBlockEl.find("pre") : $(el).find("pre");
        if (preEl.length > 0) {
          $(el)
            .find("*")
            .each((_, descendant) => {
              seen.add(descendant);
            });
          const codeEl = preEl.find("code");
          const codeText = codeEl.length > 0 ? codeEl.text() : preEl.text();
          if (codeText) {
            // Language label: first child div before the <pre> (inside
            // markdown-code-block or directly in the data-block section).
            const container = codeBlockEl.length > 0 ? codeBlockEl : $(el);
            const langDiv = container.children("div").first();
            const lang =
              langDiv.length > 0 && langDiv.find("pre").length === 0
                ? langDiv.text().trim()
                : "";
            const langAttr = lang
              ? ` class="language-${escapeHtml(lang)}"`
              : "";
            parts.push(
              `<pre><code${langAttr}>${escapeHtml(codeText)}</code></pre>`,
            );
          }
          return;
        }
      }
      // Skip text blocks that are inside or contain embedded tweets
      // within the article — those are handled by the tweet extraction
      // below.  Only check for tweet ancestors WITHIN the richView
      // (embedded tweets), not ancestors above it (the main tweet on
      // /status/ pages wraps the entire article).
      const tweetAncestor = $(el).closest(
        '[data-testid="tweet"], [data-testid="simpleTweet"]',
      );
      if (
        tweetAncestor.length > 0 &&
        tweetAncestor.closest('[data-testid="twitterArticleRichTextView"]')
          .length > 0
      ) {
        return;
      }
      if (
        $(el).find('[data-testid="tweet"]').length > 0 ||
        $(el).find('[data-testid="simpleTweet"]').length > 0
      ) {
        return;
      }
      // Preserve links by extracting text and <a> tags from the block.
      // Draft.js wraps content in nested spans — we walk leaf nodes only,
      // skipping spans that are inside <a> tags (the <a> itself handles those).
      const blockParts: string[] = [];
      $(el)
        .find("span, a")
        .each((_, child) => {
          if ($(child).is("a")) {
            const href = $(child).attr("href") ?? "";
            const linkText = $(child).text().trim();
            const safeHref = sanitizeUrl(href);
            if (safeHref && linkText) {
              blockParts.push(
                `<a href="${escapeHtml(safeHref)}">${escapeHtml(linkText)}</a>`,
              );
            }
          } else if ($(child).is("span")) {
            // Skip spans inside <a> tags — already handled above
            if ($(child).closest("a").length > 0) return;
            // Only emit leaf spans (no child spans or anchors)
            if (
              $(child).children("a").length === 0 &&
              $(child).children("span").length === 0
            ) {
              const text = $(child).text();
              if (text) {
                blockParts.push(escapeHtml(text));
              }
            }
          }
        });
      const blockHtml = blockParts.join("").trim();
      if (blockHtml) {
        // Detect flattened code blocks: headless Chrome may render X's
        // markdown-code-block as flat text with the language label
        // concatenated before the code content (e.g. "plaintext# Project").
        const codeBlockMatch = blockHtml.match(
          /^(plaintext|markdown|json|yaml|toml|javascript|typescript|python|ruby|go|rust|java|bash|sh|shell|css|html|xml|sql|c|cpp|csharp|swift|kotlin|php|r|scala|perl|lua|haskell|elixir|clojure|diff|dockerfile|makefile|ini|properties|text|txt|code)(.+)/s,
        );
        if (codeBlockMatch) {
          const lang = codeBlockMatch[1]!;
          const code = codeBlockMatch[2]!;
          parts.push(
            `<pre><code class="language-${escapeHtml(lang)}">${code}</code></pre>`,
          );
        } else {
          parts.push(`<p>${blockHtml}</p>`);
        }
      }
    } else if (testId === "tweetPhoto") {
      seen.add(el);
      // Skip photos inside embedded tweets
      if (
        $(el).closest('[data-testid="tweet"]').length > 0 ||
        $(el).closest('[data-testid="simpleTweet"]').length > 0
      ) {
        return;
      }
      // Skip the banner image we already extracted
      const img = $(el).find("img").first();
      const src = img.attr("src") ?? "";
      const safeSrc = sanitizeUrl(src);
      if (safeSrc && src !== firstPhoto.attr("src")) {
        parts.push(`<img src="${escapeHtml(safeSrc)}" />`);
      }
    } else if (testId === "tweet" || testId === "simpleTweet") {
      seen.add(el);
      // Mark all descendants as seen so they don't get processed individually
      $(el)
        .find("*")
        .each((_, descendant) => {
          seen.add(descendant);
        });
      // Extract embedded tweet — get all tweetText elements (first is the main
      // tweet, second is a quote tweet if present) and a link to the original.
      const tweetTexts = $(el).find('[data-testid="tweetText"]');
      const statusLink = $(el).find('a[href*="/status/"]').first();
      const href = statusLink.attr("href") ?? "";
      const tweetUrl = href ? (sanitizeUrl(href.split("?")[0]) ?? "") : "";

      const mainText = tweetTexts.eq(0).text().trim();
      const quoteText =
        tweetTexts.length > 1 ? tweetTexts.eq(1).text().trim() : "";

      // Extract card link if present inside the embedded tweet
      const cardEl = $(el).find('[data-testid="card.wrapper"] a[href]').first();
      const cardHref = cardEl.attr("href") ?? "";
      const cardTitle = $(el)
        .find('[data-testid="card.layoutSmall.detail"]')
        .text()
        .trim();

      if (mainText || tweetUrl) {
        const contentParts: string[] = [];
        if (mainText) {
          contentParts.push(`<p>${escapeHtml(mainText)}</p>`);
        }
        if (quoteText) {
          contentParts.push(
            `<blockquote><p>${escapeHtml(quoteText)}</p></blockquote>`,
          );
        }
        const safeCardHref = sanitizeUrl(cardHref);
        if (safeCardHref) {
          const display = cardTitle || cardHref;
          contentParts.push(
            `<p><a href="${escapeHtml(safeCardHref)}">${escapeHtml(display)}</a></p>`,
          );
        }
        if (tweetUrl) {
          contentParts.push(
            `<p><a href="${escapeHtml(tweetUrl)}">${escapeHtml(tweetUrl)}</a></p>`,
          );
        }
        parts.push(`<blockquote>${contentParts.join("\n")}</blockquote>`);
      }
    } else if (testId === "videoPlayer" || testId === "videoComponent") {
      seen.add(el);
      $(el)
        .find("*")
        .each((_, descendant) => {
          seen.add(descendant);
        });
      const poster = $(el).find("video").attr("poster");
      if (poster) {
        const videoHtml = buildVideoHtml(poster, pageUrl);
        if (videoHtml) {
          parts.push(videoHtml);
        }
      }
    } else if (testId === "card.wrapper") {
      seen.add(el);
      $(el)
        .find("*")
        .each((_, descendant) => {
          seen.add(descendant);
        });
      // Extract link card — URL and title text
      const cardLink = $(el).find("a[href]").first();
      const cardHref = cardLink.attr("href") ?? "";
      const cardDetail = $(el)
        .find('[data-testid="card.layoutSmall.detail"]')
        .text()
        .trim();
      const safeCardHref = sanitizeUrl(cardHref);
      if (safeCardHref) {
        const displayText = cardDetail || cardHref;
        parts.push(
          `<p><a href="${escapeHtml(safeCardHref)}">${escapeHtml(displayText)}</a></p>`,
        );
      }
    }
  });

  // Extract replies section — injected by the crawler from the original tweet
  // page before navigating to the article. Format: <h3>Replies</h3> followed
  // by <blockquote> elements containing reply text and tweet status links.
  const repliesHeader = $("h3").filter((_, el) => $(el).text() === "Replies");
  if (repliesHeader.length > 0) {
    parts.push("<hr />");
    parts.push("<h3>Replies</h3>");
    // Collect all blockquotes that follow the Replies header
    let next = repliesHeader.first().next();
    while (next.length > 0 && next.is("blockquote")) {
      const html = next.html()?.trim();
      if (html) {
        parts.push(`<blockquote>${html}</blockquote>`);
      }
      next = next.next();
    }
  }

  return parts.length > 0 ? parts.join("\n") : undefined;
};

/**
 * Collect tweets from the page, deduping post-scroll duplicates against
 * injected reply tweets (which preserve X's display order).
 */
const collectDedupedTweets = (
  $: CheerioAPI,
  tweetEls: ReturnType<typeof getTopLevelTweetEls>,
  tweetId: string | undefined,
): ExtractedTweet[] => {
  // Build a set of tweet URLs in the injected reply container so we
  // can skip their duplicates in the post-scroll DOM.  The injected
  // tweets are in X's display order (collected top-to-bottom during
  // scrolling) — we preserve that order, not the post-scroll DOM order.
  const injectedUrls = new Set<string>();
  $(
    "[data-karakeep-replies] [data-testid='tweet'] a[href*='/status/']," +
      "[data-karakeep-replies] [data-testid='simpleTweet'] a[href*='/status/']",
  ).each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (/^\/\w+\/status\/\d+$/.test(href)) {
      injectedUrls.add(`https://x.com${href}`);
    }
  });

  const tweets: ExtractedTweet[] = [];
  const seenUrls = new Set<string>();
  tweetEls.each((_, el) => {
    const isInjected = $(el).closest("[data-karakeep-replies]").length > 0;
    const tweet = extractSingleTweet($(el), $, tweetId);
    if (tweet) {
      if (tweet.tweetUrl && seenUrls.has(tweet.tweetUrl)) return;
      if (!isInjected && tweet.tweetUrl && injectedUrls.has(tweet.tweetUrl))
        return;
      if (tweet.tweetUrl) seenUrls.add(tweet.tweetUrl);
      tweets.push(tweet);
    }
  });
  return tweets;
};

/**
 * Ensure `tweets` has a main tweet marked.  Tries (in order):
 * 1. Already marked by status ID match
 * 2. Pre-scroll main tweet container (un-virtualized DOM)
 * 3. First tweet by the URL's author handle
 * 4. First tweet on the page (only when `markFirst` is true)
 */
const resolveMainTweet = (
  $: CheerioAPI,
  url: string,
  tweets: ExtractedTweet[],
  tweetId: string | undefined,
  markFirst: boolean,
): void => {
  if (tweets.some((t) => t.isMainTweet)) return;

  // Pre-scroll main tweet (most reliable — un-virtualized DOM)
  const preScrollContainer = $('[data-karakeep-main-tweet="pre-scroll"]');
  if (preScrollContainer.length > 0) {
    const preEl = preScrollContainer
      .find('[data-testid="tweet"], [data-testid="simpleTweet"]')
      .first();
    if (preEl.length > 0) {
      const preMain = extractSingleTweet(preEl, $, tweetId);
      if (preMain) {
        preMain.isMainTweet = true;
        const duplicateIdx = tweets.findIndex(
          (tweet) =>
            (preMain.tweetUrl && tweet.tweetUrl === preMain.tweetUrl) ||
            (tweet.authorHandle === preMain.authorHandle &&
              tweet.timestamp === preMain.timestamp &&
              tweet.textHtml === preMain.textHtml),
        );
        if (duplicateIdx !== -1) {
          tweets.splice(duplicateIdx, 1);
        }
        tweets.unshift(preMain);
        return;
      }
    }
  }

  // Username fallback
  const username = extractTweetUsername(url);
  if (username) {
    const lc = `@${username.toLowerCase()}`;
    const match = tweets.find((t) => t.authorHandle.toLowerCase() === lc);
    if (match) {
      match.isMainTweet = true;
      return;
    }
  }

  // Last resort
  if (markFirst && tweets.length > 0) {
    tweets[0].isMainTweet = true;
  }
};

/**
 * Extract article content from a /status/ page that has an inline article.
 * Combines the article body (via extractArticleFromDom) with tweet-style
 * reply extraction from the same page.
 */
const extractArticleWithReplies = (
  $: CheerioAPI,
  url: string,
): string | undefined => {
  // Only attempt article extraction if the DOM actually contains
  // article-specific elements — otherwise extractArticleFromDom may
  // return a banner image from a regular tweet as "article content".
  if (!isArticleUrl(url) && !hasArticleDom($)) return undefined;

  const articleHtml = extractArticleFromDom($, url);
  if (!articleHtml) return undefined;

  const tweetId = extractTweetId(url);
  const tweetEls = getTopLevelTweetEls($);
  const tweets = collectDedupedTweets($, tweetEls, tweetId);

  resolveMainTweet($, url, tweets, tweetId, false);

  const mainIndex = tweets.findIndex((t) => t.isMainTweet);
  const replyTweets =
    mainIndex >= 0
      ? tweets.slice(mainIndex + 1, mainIndex + 1 + MAX_REPLIES)
      : [];

  if (replyTweets.length > 0) {
    const replyParts = ["\n<hr />", "<h3>Replies</h3>"];
    for (const tweet of replyTweets) {
      replyParts.push(`<blockquote>${buildTweetHtml(tweet)}</blockquote>`);
    }
    return articleHtml + replyParts.join("\n");
  }

  return articleHtml;
};

/**
 * Full DOM-based extraction for authenticated sessions.
 * Extracts thread context, main tweet, and replies.
 */
const extractFromDom = ($: CheerioAPI, url: string): string | undefined => {
  const tweetId = extractTweetId(url);
  const tweetEls = getTopLevelTweetEls($);

  if (tweetEls.length === 0) {
    return undefined;
  }

  const tweets = collectDedupedTweets($, tweetEls, tweetId);
  if (tweets.length === 0) {
    return undefined;
  }

  resolveMainTweet($, url, tweets, tweetId, true);

  // Classify: thread (before main), main, replies (after main)
  const mainIndex = tweets.findIndex((t) => t.isMainTweet);
  const threadTweets = tweets.slice(0, mainIndex);
  const mainTweet = tweets[mainIndex];
  const replyTweets = tweets.slice(mainIndex + 1, mainIndex + 1 + MAX_REPLIES);

  const htmlParts: string[] = [];

  // Thread context
  for (const tweet of threadTweets) {
    htmlParts.push(`<blockquote>${buildTweetHtml(tweet)}</blockquote>`);
  }

  if (threadTweets.length > 0) {
    htmlParts.push("<hr />");
  }

  // Main tweet
  if (mainTweet) {
    htmlParts.push(buildTweetHtml(mainTweet));
  }

  // Replies
  if (replyTweets.length > 0) {
    htmlParts.push("<hr />");
    htmlParts.push("<h3>Replies</h3>");
    for (const tweet of replyTweets) {
      htmlParts.push(`<blockquote>${buildTweetHtml(tweet)}</blockquote>`);
    }
  }

  return htmlParts.join("\n");
};

/**
 * Fallback extraction using og: meta tags when the DOM doesn't have
 * rendered tweet elements (unauthenticated / page didn't fully load).
 */
const extractFromMetaTags = (
  $: CheerioAPI,
  url: string,
): string | undefined => {
  const ogDescription =
    $('meta[property="og:description"]').attr("content")?.trim() ?? "";
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim() ?? "";

  if (!ogDescription && !ogTitle) {
    return undefined;
  }

  const parts: string[] = [];

  // Parse author from og:title (format: "Author Name on X: \"tweet text\"")
  if (ogTitle) {
    const authorMatch = ogTitle.match(/^(.+?)\s+on X:/);
    if (authorMatch) {
      // Extract username from URL
      try {
        const username = new URL(url).pathname.split("/")[1];
        parts.push(
          `<p><strong>${escapeHtml(authorMatch[1])}</strong>${username ? ` @${escapeHtml(username)}` : ""}</p>`,
        );
      } catch {
        parts.push(`<p><strong>${escapeHtml(authorMatch[1])}</strong></p>`);
      }
    }
  }

  // Tweet text from description
  if (ogDescription) {
    parts.push(`<p>${escapeHtml(ogDescription)}</p>`);
  }

  // Image (skip the default X/Twitter OG image)
  if (ogImage && !ogImage.includes("/og/image.png")) {
    const safeOgImage = sanitizeUrl(ogImage);
    if (safeOgImage) {
      parts.push(`<img src="${escapeHtml(safeOgImage)}" />`);
    }
  }

  return parts.length > 0 ? parts.join("\n") : undefined;
};

const test = ({ url }: { url: string }): boolean => {
  const domain = domainFromUrl(url).toLowerCase();
  return domain === "twitter" || domain === "x";
};

/**
 * Extract the main tweet's text from rendered DOM.
 * Returns the first tweet's text content, truncated for use as a title.
 */
const extractTitleFromTweetDom = (
  $: CheerioAPI,
  url: string,
): string | undefined => {
  const mainEl = findMainTweetEl($, url);
  if (!mainEl) return undefined;

  const tweetText = mainEl.find('[data-testid="tweetText"]').first();
  const text = tweetText.text().trim();
  if (!text) return undefined;

  const MAX_TITLE_LENGTH = 100;
  if (text.length <= MAX_TITLE_LENGTH) return text;
  return text.slice(0, MAX_TITLE_LENGTH).trimEnd() + "…";
};

const extractTitleFromMeta = ($: CheerioAPI): string | undefined => {
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  if (!ogTitle || ogTitle === "X") return undefined;

  const match = ogTitle.match(/^.+?\s+on X:\s*"?(.+?)"?\s*$/);
  if (match) {
    const text = match[1].replace(/"$/, "").trim();
    return text || undefined;
  }

  return ogTitle;
};

// Cache findMainTweetEl results across title/image/author calls for the
// same DOM (metascraper invokes each rule independently).
const mainTweetCache = new WeakMap<
  CheerioAPI,
  ReturnType<CheerioAPI> | undefined
>();

/**
 * Find the main (bookmarked) tweet element from a list of top-level tweets.
 *
 * Strategy (in order):
 * 1. Pre-scroll main tweet injected by the crawler — the most reliable
 *    source because X hasn't virtualized or altered the DOM yet.
 * 2. Status ID match in the current DOM.
 * 3. First tweet by the URL's author handle (the main tweet is always
 *    the first tweet by the page's author on a /status/ page).
 * 4. First tweet on the page as a last resort.
 */
const findMainTweetEl = (
  $: CheerioAPI,
  url: string,
): ReturnType<CheerioAPI> | undefined => {
  if (mainTweetCache.has($)) return mainTweetCache.get($);
  const result = findMainTweetElUncached($, url);
  mainTweetCache.set($, result);
  return result;
};

const findMainTweetElUncached = (
  $: CheerioAPI,
  url: string,
): ReturnType<CheerioAPI> | undefined => {
  // Prefer the pre-scroll main tweet injected by the crawler — it has
  // the un-virtualized DOM with correct status links and metadata.
  const preScrollContainer = $('[data-karakeep-main-tweet="pre-scroll"]');
  if (preScrollContainer.length > 0) {
    const preScrollTweet = preScrollContainer
      .find('[data-testid="tweet"], [data-testid="simpleTweet"]')
      .first();
    if (preScrollTweet.length > 0) return preScrollTweet;
  }

  const tweetId = extractTweetId(url);
  const tweetEls = getTopLevelTweetEls($);
  if (tweetEls.length === 0) return undefined;

  // Try status ID match
  let mainEl: ReturnType<CheerioAPI> | undefined;
  if (tweetId) {
    tweetEls.each((_, el) => {
      if (mainEl) return;
      if ($(el).find(`a[href*="/status/${tweetId}"]`).length > 0) {
        mainEl = $(el);
      }
    });
  }
  if (mainEl) return mainEl;

  // Fallback: first tweet by the URL's author handle.  On a /status/
  // page the main tweet is always the first one by that author — thread
  // context from other authors appears before it, self-replies after.
  const username = extractTweetUsername(url);
  if (username) {
    const lc = `@${username.toLowerCase()}`;
    let anyMatch: ReturnType<CheerioAPI> | undefined;
    tweetEls.each((_, el) => {
      if (anyMatch) return;
      let handle = "";
      $(el)
        .find('a[role="link"]')
        .each((_, linkEl) => {
          if (!handle) {
            const text = $(linkEl).text().trim();
            if (
              text.startsWith("@") &&
              /^\/\w+$/.test($(linkEl).attr("href") ?? "")
            ) {
              handle = text.toLowerCase();
            }
          }
        });
      if (handle === lc) anyMatch = $(el);
    });
    if (anyMatch) return anyMatch;
  }

  return $(tweetEls.first());
};

const extractImageFromTweetDom = (
  $: CheerioAPI,
  url: string,
): string | undefined => {
  const mainEl = findMainTweetEl($, url);
  if (!mainEl) return undefined;

  // Try tweet photos — for article tweets, prefer photos outside the
  // article rich text view (the banner image) over content images.
  let imgSrc: string | undefined;
  mainEl.find('[data-testid="tweetPhoto"] img').each((_, el) => {
    if (imgSrc) return;
    const src = $(el).attr("src");
    if (!src) return;
    // Skip photos inside the article rich text (those are content images)
    if ($(el).closest('[data-testid="twitterArticleRichTextView"]').length > 0)
      return;
    imgSrc = src;
  });
  // If no non-article photo found, use the first photo
  if (!imgSrc) {
    imgSrc = mainEl.find('[data-testid="tweetPhoto"] img').first().attr("src");
  }
  if (imgSrc) return imgSrc.replace(/name=\w+/, "name=small");

  // Fallback to video poster/thumbnail (within main tweet)
  const poster = mainEl
    .find('[data-testid="videoPlayer"] video')
    .attr("poster");
  if (poster) return poster.replace(/name=\w+/, "name=small");

  // Last resort: search entire page for first tweetPhoto or video poster
  // (handles cases where findMainTweetEl matched the wrong element)
  const globalPhoto = $('[data-testid="tweetPhoto"] img').first().attr("src");
  if (globalPhoto) return globalPhoto.replace(/name=\w+/, "name=small");
  const globalPoster = $('[data-testid="videoPlayer"] video').attr("poster");
  if (globalPoster) return globalPoster.replace(/name=\w+/, "name=small");

  return undefined;
};

const extractImageFromMeta = ($: CheerioAPI): string | undefined => {
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim() ?? "";
  if (!ogImage || ogImage.includes("/og/image.png")) return undefined;
  return ogImage;
};

const extractAuthorFromTweetDom = (
  $: CheerioAPI,
  url: string,
): string | undefined => {
  const mainEl = findMainTweetEl($, url);
  if (!mainEl) return undefined;

  // Look for UserAvatar-Container inside the matched tweet only
  // (not globally — the logged-in user's avatar in the sidebar also
  // has this testid and would be a false match).
  let author: string | undefined;
  mainEl.find('[data-testid^="UserAvatar-Container-"]').each((_, el) => {
    if (author) return;
    // Skip avatars inside nested/quoted tweets
    if ($(el).parents('[data-testid="tweet"]').length > 1) return;
    const testId = $(el).attr("data-testid") ?? "";
    const match = testId.match(/^UserAvatar-Container-(.+)$/);
    if (match) author = match[1];
  });
  if (author) return author;

  // Fallback: look for @handle links in the matched tweet
  let handle: string | undefined;
  mainEl.find('a[role="link"]').each((_, linkEl) => {
    if (handle) return;
    const text = $(linkEl).text().trim();
    const href = $(linkEl).attr("href") ?? "";
    if (text.startsWith("@") && /^\/\w+$/.test(href)) {
      handle = text.replace("@", "");
    }
  });
  return handle;
};

const extractAuthorFromMeta = ($: CheerioAPI): string | undefined => {
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  if (!ogTitle || ogTitle === "X") return undefined;

  const match = ogTitle.match(/^(.+?)\s+on X:/);
  if (match) return match[1].trim() || undefined;

  const handleMatch = ogTitle.match(/^@(\w+)\s+on X$/);
  if (handleMatch) return handleMatch[1];

  return undefined;
};

const metascraperTwitter = () => {
  type TwitterRuleOption = (opts: {
    htmlDom: CheerioAPI;
    url: string;
  }) => string | undefined;

  const rules: Rules = {
    pkgName: "metascraper-twitter",
    test,
    title: (({ htmlDom, url }: { htmlDom: CheerioAPI; url: string }) => {
      const isArticle = isArticleUrl(url) || hasArticleDom(htmlDom);
      // Article title from DOM
      if (isArticle) {
        const titleEl = htmlDom(
          '[data-testid="twitter-article-title"]',
        ).first();
        const articleTitle = titleEl.text().trim();
        if (articleTitle) return articleTitle;
        // Don't fall through to tweet DOM for articles — the page has
        // many tweet elements and we'd pick up the wrong one.
        return extractTitleFromMeta(htmlDom);
      }
      // Tweet text from rendered DOM
      const domTitle = extractTitleFromTweetDom(htmlDom, url);
      if (domTitle) return domTitle;
      // Fallback to og:title parsing
      return extractTitleFromMeta(htmlDom);
    }) as TwitterRuleOption as RulesOptions,
    image: (({ htmlDom, url }: { htmlDom: CheerioAPI; url: string }) => {
      // For article pages: find the banner image — the first tweetPhoto
      // NOT inside the article rich text view (those are content images).
      // Check the pre-scroll main tweet first (most reliable), then
      // the article's parent tweet in the main DOM.
      if (hasArticleDom(htmlDom)) {
        let bannerSrc: string | undefined;
        // Search pre-scroll main tweet first (banner survives there)
        const preScrollContainer = htmlDom(
          '[data-karakeep-main-tweet="pre-scroll"]',
        );
        const articleContainer = htmlDom(
          '[data-testid="twitterArticleRichTextView"]',
        ).closest('[data-testid="tweet"], [data-testid="simpleTweet"]');
        const searchRoots = [preScrollContainer, articleContainer].filter(
          (r) => r.length > 0,
        );
        for (const root of searchRoots) {
          if (bannerSrc) break;
          root.find('[data-testid="tweetPhoto"] img').each((_, el) => {
            if (bannerSrc) return;
            const src = htmlDom(el).attr("src");
            if (!src) return;
            if (
              htmlDom(el).closest('[data-testid="twitterArticleRichTextView"]')
                .length > 0
            )
              return;
            bannerSrc = src;
          });
        }
        if (bannerSrc) return bannerSrc.replace(/name=\w+/, "name=small");
      }
      // Try main tweet's image (scoped to the bookmarked tweet)
      const domImage = extractImageFromTweetDom(htmlDom, url);
      if (domImage) return domImage;
      // Fallback to og:image (skips default X placeholder)
      return extractImageFromMeta(htmlDom);
    }) as TwitterRuleOption as RulesOptions,
    author: (({ htmlDom, url }: { htmlDom: CheerioAPI; url: string }) => {
      // Use the main tweet element for author extraction — works for
      // both regular tweets and articles on /status/ pages.
      const domAuthor = extractAuthorFromTweetDom(htmlDom, url);
      if (domAuthor) return domAuthor;
      // Fallback to og:title parsing
      return extractAuthorFromMeta(htmlDom);
    }) as TwitterRuleOption as RulesOptions,
    readableContentHtml: (({
      htmlDom,
      url,
    }: {
      htmlDom: CheerioAPI;
      url: string;
    }) => {
      // parseHtmlSubprocess runs the heavier DOM extraction path directly for
      // authenticated X/Twitter pages. Keep the metascraper rule lightweight
      // so it only provides the unauthenticated og: meta-tag fallback.
      return extractFromMetaTags(htmlDom, url);
    }) as TwitterRuleOption as RulesOptions,
  };

  return rules;
};

export const __private = {
  extractFromDom,
  extractArticleWithReplies,
  extractTitleFromTweetDom,
  extractTitleFromMeta,
  extractImageFromTweetDom,
  extractImageFromMeta,
  extractAuthorFromTweetDom,
  extractAuthorFromMeta,
};

export default metascraperTwitter;
