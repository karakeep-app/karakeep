import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

export type Release = CollectionEntry<"releases">;

/** Published releases, newest first. */
export async function getReleases(): Promise<Release[]> {
  const releases = await getCollection(
    "releases",
    (release) => import.meta.env.DEV || !release.data.draft,
  );
  return releases.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function releaseUrl(release: Release) {
  return `/blog/releases/v${release.data.version}/`;
}

/**
 * Patch releases (x.y.z, z > 0) are hotfixes and get less visual weight.
 * Set `patch` in the frontmatter to override, e.g. when x.y.0 was never
 * published on its own.
 */
export function isPatchRelease(release: Release) {
  return release.data.patch ?? !release.data.version.endsWith(".0");
}

/** Karakeep was called Hoarder until the 0.23.1 rebrand. */
export function isHoarderEraRelease(release: Release) {
  return release.data.date < new Date("2025-04-05T00:00:00Z");
}

/** Published blog posts, newest first. */
export async function getPosts() {
  const posts = await getCollection(
    "blog",
    (post) => import.meta.env.DEV || !post.data.draft,
  );
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function readingTime(markdown: string | undefined) {
  const words = (markdown ?? "").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 230))} min read`;
}
