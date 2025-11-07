import type { Rules } from "metascraper";

import logger from "@karakeep/shared/logger";

/**
 * This is a metascraper plugin to select a better
 * 'image' attribute for Reddit links, specifically
 * those sharing images. It will also extract the
 * Post Title for a Reddit post instead of use the
 * default.
 *
 * As of writing this, Reddit posts do not define
 * an open-graph image (og:image) attribute, so
 * metascraper resorts to looking for images in
 * the HTML DOM, and selects the first one.
 *
 * In Reddit posts, the first image is typically
 * the profile picture of the OP, which Karakeep
 * is using for the thumbnail.
 *
 * This metascraper plugin instead looks for images
 * with the domain i.redd.it, on which Reddit hosts
 * their preview images for posts. If this plugin
 * finds an i.redd.it image, it provides that for
 * the image metadata.
 *
 * If there is not a matching image, this plugin
 * will return 'undefined' and the next plugin
 * should continue to attempt to extract images.
 *
 * Note: there is another way to accomplish this.
 * If '.json' is appended to a Reddit url, the
 * server will provide a JSON document summarizing
 * the post. If there are preview images, they are
 * included in a section of the JSON. To prevent
 * additional server requests, this method is not
 * currently being used.
 **/

const domainFromUrl = (url: string): string => {
  /**
   * First-party metascraper plugins import metascraper-helpers,
   * which exposes a parseUrl function from the tldtr package.
   * This function does similar to the 'domainWithoutSuffix'
   * field from the tldtr package, without requiring any
   * additional packages.
   **/
  try {
    // Create a URL instance to parse the hostname
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    // Return the part before the TLD (assuming at least two segments)
    // For example, "www.example.com" -> ["www", "example", "com"]
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return hostname;
  } catch (error) {
    logger.error(
      "[MetascraperReddit] Test>domainFromUrl received an invalid URL:",
      error,
    );
    return "";
  }
};

const test = ({ url }: { url: string }): boolean =>
  domainFromUrl(url).toLowerCase() === "reddit";

const metascraperReddit = () => {
  const rules: Rules = {
    pkgName: "metascraper-reddit",
    test,
    image: ({ htmlDom }) => {
      // 'preview' subdomain images are more likely to be what we're after
      // but it could be in the 'i' subdomain.
      // returns undefined if neither exists
      const previewImages = htmlDom('img[src*="preview.redd.it"]')
        .map((i, el) => htmlDom(el).attr("src"))
        .get();
      const iImages = htmlDom('img[src*="i.redd.it"]')
        .map((i, el) => htmlDom(el).attr("src"))
        .get();
      return previewImages[0] || iImages[0];
    },
    title: ({ htmlDom }) => {
      const title: string | undefined = htmlDom("shreddit-title[title]")
        .first()
        .attr("title");
      const postTitle: string | undefined =
        title ??
        htmlDom("shreddit-post[post-title]").first().attr("post-title");
      return postTitle ? postTitle.trim() : undefined;
    },
  };

  return rules;
};

export default metascraperReddit;
