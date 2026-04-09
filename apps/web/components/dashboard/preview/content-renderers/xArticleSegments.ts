export interface HtmlSegment {
  type: "html";
  content: string;
}

export interface TweetSegment {
  type: "tweet";
  id: string;
}

export type ArticleSegment = HtmlSegment | TweetSegment;

export function extractReplyTweetIds(html: string): string[] {
  const repliesIdx = html.indexOf("<h3>Replies</h3>");
  if (repliesIdx === -1) {
    return [];
  }

  const repliesSection = html.slice(repliesIdx);
  const ids = new Set<string>();
  const linkPattern =
    /href="https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)"/g;

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(repliesSection)) !== null) {
    ids.add(match[1]);
  }

  return Array.from(ids);
}

export function isArticleContent(html: string): boolean {
  return html.trimStart().startsWith("<h1>");
}

function findMatchingBlockquoteEnd(
  html: string,
  startIndex: number,
): number | null {
  const tagPattern = /<\/?blockquote\b[^>]*>/gi;
  tagPattern.lastIndex = startIndex;

  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html)) !== null) {
    if (match[0][1] === "/") {
      depth -= 1;
      if (depth === 0) {
        return tagPattern.lastIndex;
      }
      continue;
    }

    depth += 1;
  }

  return null;
}

export function parseArticleSegments(html: string): ArticleSegment[] {
  const repliesIdx = html.indexOf("<h3>Replies</h3>");
  const articleHtml = repliesIdx !== -1 ? html.slice(0, repliesIdx) : html;
  const segments: ArticleSegment[] = [];

  let cursor = 0;

  while (cursor < articleHtml.length) {
    const blockquoteStart = articleHtml.indexOf("<blockquote", cursor);
    if (blockquoteStart === -1) {
      const remaining = articleHtml.slice(cursor).trim();
      if (remaining) {
        segments.push({ type: "html", content: remaining });
      }
      break;
    }

    const before = articleHtml.slice(cursor, blockquoteStart).trim();
    if (before) {
      segments.push({ type: "html", content: before });
    }

    const blockquoteEnd = findMatchingBlockquoteEnd(
      articleHtml,
      blockquoteStart,
    );
    if (blockquoteEnd === null) {
      const fallback = articleHtml.slice(blockquoteStart).trim();
      if (fallback) {
        segments.push({ type: "html", content: fallback });
      }
      break;
    }

    const blockquoteHtml = articleHtml.slice(blockquoteStart, blockquoteEnd);
    const tweetId = blockquoteHtml.match(
      /href="https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)"/,
    )?.[1];

    if (tweetId) {
      segments.push({ type: "tweet", id: tweetId });
    } else {
      segments.push({ type: "html", content: blockquoteHtml });
    }

    cursor = blockquoteEnd;
  }

  return segments;
}
