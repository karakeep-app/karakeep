import type { Page } from "playwright/test";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  bookmarkCards,
  createWebTestUser,
  it,
  reload,
  signIn,
  WORKER_TEST_TIMEOUT,
} from "../../utils/browser";
import { waitUntil } from "../../utils/general";

// Every seeded bookmark starts with a unique marker word, so that the
// results of a search can be compared as a set of markers.
const MARKERS = ["Quokka", "Pelican", "Narwhal", "Axolotl"] as const;
type Marker = (typeof MARKERS)[number];

/**
 * Seeds four bookmarks that differ in exactly the attributes the query
 * language filters on:
 * - Quokka: favourited, tagged "urgent"
 * - Pelican: archived, tagged "work in progress"
 * - Narwhal: in the "Weekend reading" list
 * - Axolotl: none of the above
 */
async function seedSearchableBookmarks(page: Page) {
  const { trpc, email } = await createWebTestUser();

  const quokka = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Quokka sightings on the island",
    favourited: true,
  });
  await trpc.bookmarks.updateTags.mutate({
    bookmarkId: quokka.id,
    attach: [{ tagName: "urgent" }],
    detach: [],
  });
  const pelican = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Pelican migration notes",
    archived: true,
  });
  await trpc.bookmarks.updateTags.mutate({
    bookmarkId: pelican.id,
    attach: [{ tagName: "work in progress" }],
    detach: [],
  });
  const narwhal = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Narwhal tusks explained",
  });
  const list = await trpc.lists.create.mutate({
    name: "Weekend reading",
    icon: "📚",
  });
  await trpc.lists.addToList.mutate({
    listId: list.id,
    bookmarkId: narwhal.id,
  });
  await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Axolotl care guide",
  });

  // Qualifiers are resolved against the database, but the matching ids are
  // still fetched through the search index, so every bookmark has to be
  // indexed before any query (even a qualifier-only one) can find it.
  await waitUntil(
    async () => {
      const result = await trpc.bookmarks.searchBookmarks.query({ text: "" });
      return result.bookmarks.length === MARKERS.length;
    },
    "All seeded bookmarks are indexed",
    90000,
  );

  await signIn(page, email);
  return { trpc };
}

async function search(page: Page, query: string) {
  const input = page.getByPlaceholder("Search titles, text, URLs, and tags…");
  await input.fill(query);
  await input.press("Enter");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe(query);
  await expect(page).toHaveURL(/\/dashboard\/search\?/);
}

async function expectResults(page: Page, expected: Marker[]) {
  const cards = bookmarkCards(page);
  if (expected.length === 0) {
    await expect(page.getByText("No bookmarks yet")).toBeVisible();
    await expect(cards).toHaveCount(0);
    return;
  }
  // The previous query's results stay on screen until the new ones arrive,
  // so poll until the set of shown bookmarks matches exactly.
  await expect
    .poll(async () => {
      const texts = await cards.allInnerTexts();
      return texts
        .map((text) => MARKERS.find((marker) => text.includes(marker)) ?? text)
        .sort();
    })
    .toEqual([...expected].sort());
}

it(
  "filters favourites with is:fav and its negation",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    await seedSearchableBookmarks(page);
    await search(page, "is:fav");
    await expectResults(page, ["Quokka"]);
    await search(page, "-is:fav");
    await expectResults(page, ["Pelican", "Narwhal", "Axolotl"]);

    // The query lives in the URL, so it survives a reload.
    await reload(page);
    await expectResults(page, ["Pelican", "Narwhal", "Axolotl"]);
  },
);

it(
  "filters archived bookmarks with is:archived and !is:archived",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    await seedSearchableBookmarks(page);
    await search(page, "is:archived");
    await expectResults(page, ["Pelican"]);
    await search(page, "!is:archived");
    await expectResults(page, ["Quokka", "Narwhal", "Axolotl"]);
  },
);

it(
  "filters by tag with # and tag: and by list with list:",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    await seedSearchableBookmarks(page);
    await search(page, "#urgent");
    await expectResults(page, ["Quokka"]);
    await search(page, 'tag:"work in progress"');
    await expectResults(page, ["Pelican"]);
    await search(page, "-#urgent");
    await expectResults(page, ["Pelican", "Narwhal", "Axolotl"]);
    await search(page, 'list:"Weekend reading"');
    await expectResults(page, ["Narwhal"]);
    await search(page, "#doesnotexist");
    await expectResults(page, []);
  },
);

it(
  "combines qualifiers with boolean logic and free text",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    await seedSearchableBookmarks(page);
    await search(page, 'is:fav or list:"Weekend reading"');
    await expectResults(page, ["Quokka", "Narwhal"]);
    await search(page, "-is:archived -is:inlist -#urgent");
    await expectResults(page, ["Axolotl"]);
    await search(page, "is:fav is:archived");
    await expectResults(page, []);
    await search(page, "migration is:archived");
    await expectResults(page, ["Pelican"]);
    await search(page, "migration -is:archived");
    await expectResults(page, []);
  },
);
