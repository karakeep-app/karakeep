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

const metascraperAmazonImproved = () => {
  const rules: Rules = {
    pkgName: "metascraper-amazon-improved",
    test,
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
