import type { APIRoute } from "astro";
import rss from "@astrojs/rss";

import { getPosts, getReleases, releaseUrl } from "../../blog/content";
import { BASE_URL } from "../../constants";

export const GET: APIRoute = async () => {
  const [posts, releases] = await Promise.all([getPosts(), getReleases()]);

  const items = [
    ...posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
      content: post.rendered?.html,
    })),
    ...releases.map((release) => ({
      title: release.data.title,
      description: release.data.description,
      pubDate: release.data.date,
      link: releaseUrl(release),
      categories: ["Release notes"],
      content: release.rendered?.html,
    })),
  ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: "Karakeep Blog",
    description:
      "Release notes, guides, and stories from building Karakeep, the open-source, self-hostable bookmark manager with AI tagging.",
    site: BASE_URL,
    trailingSlash: true,
    items,
    customData: "<language>en</language>",
  });
};
