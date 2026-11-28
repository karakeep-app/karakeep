import type { Rules } from "metascraper";

/**
 * Improved Amazon metascraper plugin that fixes image extraction.
 *
 * The default metascraper-amazon package uses `.a-dynamic-image` selector
 * which matches the FIRST element with that class. On amazon.com pages,
 * this is often the Prime logo instead of the product image.
 *
 * This plugin uses more specific selectors to target the actual product
 * image:
 * - #landingImage: The main product image ID
 * - #imgTagWrapperId img: Fallback container for product images
 * - #imageBlock img: Additional fallback for newer Amazon layouts
 *
 * By placing this plugin BEFORE metascraperAmazon() in the plugin chain,
 * we ensure the correct image is extracted while keeping all other Amazon
 * metadata (title, brand, description) from the original plugin.
 */

const REGEX_AMAZON_URL =
  /https?:\/\/(.*amazon\..*\/.*|.*amzn\..*\/.*|.*a\.co\/.*)/i;

const test = ({ url }: { url: string }): boolean => REGEX_AMAZON_URL.test(url);

const STOREFRONT_PATTERNS = [
  /^visit the (.+?)\s+store$/i,
  /^besuche den (.+?)(?:\s+|-)+store$/i,
  /^visiter la boutique\s+(.+)$/i,
  /^visita la tienda de\s+(.+)$/i,
  /^visita lo store di\s+(.+)$/i,
  /^bezoek de (.+?)(?:\s+|-)+(?:winkel|store)$/i,
  /^visite a loja\s+(.+)$/i,
  /^(.+?)\s+mağazasını ziyaret edin$/i,
  /^(.+?)のストアを表示$/,
  /^(?:brand|marke|marque|marca|merk|ブランド)\s*[:：]\s*(.+)$/i,
];

const PRIMARY_AUTHOR_ROLE_PATTERN = /\((?:author|autor|auteur|autore|著)\)/i;

function cleanAmazonByline(raw: string): string | undefined {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) {
    return undefined;
  }

  for (const pattern of STOREFRONT_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      text = match[1].trim();
      break;
    }
  }

  // Book bylines often look like "by James Clear (Author) Format: Hardcover"
  text = text
    .replace(/^(?:by|von|par|por|di)\s+/i, "")
    .replace(/\s*\((?:Author|Autor|Auteur|Autore|著)\)[\s\S]*$/i, "")
    .replace(/\s*(?:Format|Formato|形式)\s*[:：][\s\S]*$/i, "")
    .trim();

  return text || undefined;
}

const metascraperAmazonImproved = () => {
  const rules: Rules = {
    pkgName: "metascraper-amazon-improved",
    test,
    author: ({ htmlDom }) => {
      // Book pages put clean author names inside `#bylineInfo .author` spans
      // (or `.contributorNameID` on older markup), while `#bylineInfo`'s full
      // text includes "(Author) Format: Hardcover". When multiple contributors
      // have explicit role labels (e.g. Author + Translator), prefer primary
      // authors.
      const authorSpans = htmlDom("#bylineInfo .author");
      if (authorSpans.length > 0) {
        const primary: string[] = [];
        const all: string[] = [];
        authorSpans.each((_, span) => {
          const spanEl = htmlDom(span);
          const name = spanEl
            .find("a, .contributorNameID")
            .first()
            .text()
            .replace(/\s+/g, " ")
            .trim();
          if (
            !name ||
            /^visit amazon/i.test(name) ||
            /^search learn more$/i.test(name)
          ) {
            return;
          }
          all.push(name);
          if (PRIMARY_AUTHOR_ROLE_PATTERN.test(spanEl.text())) {
            primary.push(name);
          }
        });
        const picked = primary.length > 0 ? primary : all;
        if (picked.length > 0) {
          return [...new Set(picked)].join(", ");
        }
      }

      const contributorLinks = htmlDom(
        "#bylineInfo .contributorNameID, .contributorNameID",
      )
        .map((_, el) => htmlDom(el).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(
          (name) =>
            name.length > 0 &&
            !/^visit amazon/i.test(name) &&
            !/^search learn more$/i.test(name),
        );
      if (contributorLinks.length > 0) {
        return [...new Set(contributorLinks)].join(", ");
      }

      const bylineText =
        htmlDom("#bylineInfo").first().text() ||
        htmlDom("#brand").first().text();
      return cleanAmazonByline(bylineText);
    },
    image: ({ htmlDom }) => {
      // Try the main product image ID first (most reliable)
      // Prefer data-old-hires attribute for high-resolution images
      const landingImageHires = htmlDom("#landingImage").attr("data-old-hires");
      if (landingImageHires) {
        return landingImageHires;
      }

      const landingImageSrc = htmlDom("#landingImage").attr("src");
      if (landingImageSrc) {
        return landingImageSrc;
      }

      // Fallback to image block container
      const imgTagHires = htmlDom("#imgTagWrapperId img").attr(
        "data-old-hires",
      );
      if (imgTagHires) {
        return imgTagHires;
      }

      const imgTagSrc = htmlDom("#imgTagWrapperId img").attr("src");
      if (imgTagSrc) {
        return imgTagSrc;
      }

      // Additional fallback for newer Amazon layouts
      const imageBlockHires = htmlDom("#imageBlock img")
        .first()
        .attr("data-old-hires");
      if (imageBlockHires) {
        return imageBlockHires;
      }

      const imageBlockSrc = htmlDom("#imageBlock img").first().attr("src");
      if (imageBlockSrc) {
        return imageBlockSrc;
      }

      // Return undefined to allow next plugin to try
      return undefined;
    },
  };

  return rules;
};

export default metascraperAmazonImproved;
