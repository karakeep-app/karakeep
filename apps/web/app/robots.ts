import type { MetadataRoute } from "next";

import serverConfig from "@karakeep/shared/config";

// Read the config at request time: the image is built once and configured
// through env vars at runtime.
export const dynamic = "force-dynamic";

// Public lists are the only pages meant to be found through search engines.
// Everything else is either behind a login or an auth page that would only
// expose the instance and compete with karakeep.com for the brand name.
// Instances that are meant to be found (e.g. the demo or the cloud) opt into
// letting crawlers read the auth pages: if they're linked from elsewhere but
// can't be crawled, Google lists them with "No information is available for
// this page" instead of their title and description.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/public/",
        // "/" redirects to the sign-in page for signed out visitors.
        ...(serverConfig.allowSigninPageIndexing
          ? ["/$", "/signin$", "/signup$"]
          : []),
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
