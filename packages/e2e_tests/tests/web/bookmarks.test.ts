import type { Page } from "playwright/test";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { createWebTestUser, it, signIn } from "../../utils/browser";
import { waitUntil } from "../../utils/general";

async function seedBookmark(page: Page) {
  const { trpc, email } = await createWebTestUser();
  await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "A bookmark for the weekend",
  });
  await signIn(page, email);
  const bookmark = page.locator("[data-bookmark-index]");
  await expect(bookmark).toHaveCount(1);
  return bookmark;
}

it("saves a link and finds it through search", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  await signIn(page, email);
  await page
    .getByPlaceholder("Paste a link, write a note or drop an image…")
    .fill("http://nginx/hello.html");
  await page.getByRole("button", { name: /^Save/ }).click();
  const cards = page.locator("[data-bookmark-index]");
  await expect(cards).toHaveCount(1);

  // Crawling and search indexing happen asynchronously in the workers.
  await waitUntil(
    async () => {
      const result = await trpc.bookmarks.searchBookmarks.query({
        text: "My test title",
      });
      return result.bookmarks.some(
        (bookmark) =>
          bookmark.content.type === BookmarkTypes.LINK &&
          bookmark.content.url === "http://nginx/hello.html",
      );
    },
    "Saved bookmark is crawled and searchable",
    30000,
  );

  const search = page.getByPlaceholder("Search titles, text, URLs, and tags…");
  await search.fill("My test title");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/search\?/);
  await expect(cards.filter({ hasText: "My test title" })).toBeVisible();
  await expect(cards).toHaveCount(1);
});

it("favorites a bookmark and shows it in Favourites", async ({ page }) => {
  const bookmark = await seedBookmark(page);
  await bookmark.hover();
  await bookmark.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect(
    bookmark.getByRole("button", { name: "Unfavorite", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Favourites/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/favourites$/);
  await expect(bookmark).toHaveText(/A bookmark for the weekend/);
  await page.reload();
  await bookmark.hover();
  await expect(
    bookmark.getByRole("button", { name: "Unfavorite", exact: true }),
  ).toBeVisible();
});

it("archives a bookmark and shows it in Archive", async ({ page }) => {
  const bookmark = await seedBookmark(page);
  await bookmark.hover();
  await bookmark.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(bookmark).toHaveCount(0);
  await page.getByRole("link", { name: "Archive", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/archive$/);
  await expect(bookmark).toHaveText(/A bookmark for the weekend/);
  await page.reload();
  await bookmark.hover();
  await expect(
    bookmark.getByRole("button", { name: "Un-archive", exact: true }),
  ).toBeVisible();
});

it("moves a deleted bookmark to the trash and undoes it", async ({ page }) => {
  const bookmark = await seedBookmark(page);
  await bookmark.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(bookmark).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(bookmark).toHaveText(/A bookmark for the weekend/);
  await page.reload();
  await expect(bookmark).toHaveCount(1);
});

it("permanently deletes a bookmark from the trash", async ({ page }) => {
  const bookmark = await seedBookmark(page);
  await bookmark.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(bookmark).toHaveCount(0);
  await page.getByRole("link", { name: "Trash", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/trash$/);
  await expect(bookmark).toHaveText(/A bookmark for the weekend/);
  await bookmark.hover();
  await bookmark.locator('button[aria-haspopup="menu"]').click();
  await page
    .getByRole("menuitem", { name: "Delete Permanently", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete Bookmark?" })
    .getByRole("button", { name: "Delete Permanently", exact: true })
    .click();
  await expect(bookmark).toHaveCount(0);
  await page.reload();
  await expect(bookmark).toHaveCount(0);
});
