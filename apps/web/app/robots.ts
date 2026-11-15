import type { MetadataRoute } from "next";

// Public lists are the only pages meant to be found through search engines.
// Everything else is either behind a login or an auth page that would only
// expose the instance and compete with karakeep.com for the brand name.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/public/",
        // What a public list needs to render: the JS/CSS bundles, the signed
        // asset URLs for its images, the query that loads more bookmarks as
        // you scroll, and the icons.
        "/_next/static/",
        "/api/public/",
        "/api/trpc/publicBookmarks.",
        "/icons/",
        "/favicon.ico",
        "/favicon.svg",
        "/apple-icon.png",
      ],
      disallow: "/",
    },
  };
}
