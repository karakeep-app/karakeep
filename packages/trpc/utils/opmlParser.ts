/**
 * OPML Parser - Parses OPML files to extract RSS feed information
 */

export interface OpmlFeed {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  category?: string;
}

export function parseOpml(opmlContent: string): OpmlFeed[] {
  const feeds: OpmlFeed[] = [];

  // Regular expression to match outline elements with xmlUrl attribute
  // OPML feeds are typically in <outline> tags with xmlUrl attributes
  const outlineRegex = /<outline[^>]*>/gi;
  const matches = opmlContent.matchAll(outlineRegex);

  for (const match of matches) {
    const outlineTag = match[0];

    // Extract xmlUrl (required for RSS feeds)
    const xmlUrlMatch = outlineTag.match(/xmlUrl=["']([^"']+)["']/i);
    if (!xmlUrlMatch) {
      // Skip outlines without xmlUrl (these are category/folder outlines)
      continue;
    }

    const xmlUrl = xmlUrlMatch[1];

    // Extract title (try both 'title' and 'text' attributes)
    const titleMatch =
      outlineTag.match(/title=["']([^"']+)["']/i) ||
      outlineTag.match(/text=["']([^"']+)["']/i);
    const title = titleMatch ? titleMatch[1] : xmlUrl;

    // Extract htmlUrl (optional)
    const htmlUrlMatch = outlineTag.match(/htmlUrl=["']([^"']+)["']/i);
    const htmlUrl = htmlUrlMatch ? htmlUrlMatch[1] : undefined;

    // Try to extract category from parent outline if present
    // This is a simplified approach - in full OPML, categories can be nested
    let category: string | undefined;
    const beforeOutline = opmlContent.substring(0, match.index);
    const categoryMatch = beforeOutline.match(
      /<outline[^>]+text=["']([^"']+)["'][^>]*>(?:(?!xmlUrl).)*$/i,
    );
    if (categoryMatch) {
      category = categoryMatch[1];
    }

    // Decode HTML entities
    const decodedTitle = decodeHtmlEntities(title);
    const decodedXmlUrl = decodeHtmlEntities(xmlUrl);
    const decodedHtmlUrl = htmlUrl ? decodeHtmlEntities(htmlUrl) : undefined;

    feeds.push({
      title: decodedTitle,
      xmlUrl: decodedXmlUrl,
      htmlUrl: decodedHtmlUrl,
      category,
    });
  }

  return feeds;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };

  return text.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
}
