import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";

import type { DB } from "@karakeep/db";
import serverConfig from "@karakeep/shared/config";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { getPublishedReaderSummary } from "./summaryState";

const markdown = new Marked({ gfm: true, async: false });
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function summaryReaderHtml(summary: string, sourceUrl: string): string {
  const html = markdown.parse(summary, { async: false });
  return sanitizeHtml(
    `<article><p><strong>ИИ-саммари</strong></p>${html}<p><a href="${escape(sourceUrl)}">Открыть оригинал</a></p></article>`,
    {
      allowedTags: [
        "article",
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "li",
        "strong",
        "em",
        "blockquote",
        "code",
        "pre",
        "br",
        "hr",
        "a",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
      ],
      allowedAttributes: { a: ["href", "title"] },
      allowedSchemes: ["http", "https"],
      allowProtocolRelative: false,
      disallowedTagsMode: "discard",
    },
  );
}

// Input must already be authorized by the caller. This is a response projection,
// never a mutation of the original link body, archive or asset.
export function projectSummaryForReader(
  db: DB,
  bookmark: ZBookmark,
  includeContent: boolean,
): ZBookmark {
  if (
    !serverConfig.summary.readerEnabled ||
    bookmark.content.type !== BookmarkTypes.LINK
  )
    return bookmark;
  const summary = getPublishedReaderSummary(db, bookmark.id, bookmark.userId);
  if (!summary) return bookmark;
  return {
    ...bookmark,
    content: {
      ...bookmark.content,
      ...(includeContent
        ? { htmlContent: summaryReaderHtml(summary, bookmark.content.url) }
        : {}),
      readerViewStatus: "readable",
      readerViewScore: 100,
      preferredPreview: "reader_view",
    },
  };
}
