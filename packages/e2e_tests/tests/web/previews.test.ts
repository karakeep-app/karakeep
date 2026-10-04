import type { Page } from "playwright/test";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { createWebTestUser, it, signIn } from "../../utils/browser";

async function seedPreview(page: Page) {
  const { trpc, email } = await createWebTestUser();
  const bookmark = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    title: "Preview test bookmark",
    text: "# Weekend plans\n\nRead a book and take a walk.",
    note: "Bring the paperback",
  });
  await signIn(page, email);
  return `/dashboard/preview/${bookmark.id}`;
}

it("opens and closes a bookmark preview modal", async ({ page }) => {
  const previewPath = await seedPreview(page);
  const card = page.locator("[data-bookmark-index]");
  // Cards have both a timestamp link and an expand link to the preview.
  await card.locator(`a[href="${previewPath}"]`).last().click();
  await expect(page).toHaveURL(new RegExp(`${previewPath}$`));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Weekend plans" }),
  ).toBeVisible();
  await expect(
    dialog
      .getByText("Read a book and take a walk.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    dialog.getByPlaceholder("Write some notes ...").filter({ visible: true }),
  ).toHaveValue("Bring the paperback");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/bookmarks$/);
  await expect(card).toBeVisible();
});

it("loads a bookmark preview directly as a full page", async ({ page }) => {
  const previewPath = await seedPreview(page);
  await page.goto(previewPath);
  await expect(page).toHaveURL(new RegExp(`${previewPath}$`));
  await expect(
    page.getByRole("heading", { name: "Weekend plans" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .getByText("Read a book and take a walk.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Write some notes ...").filter({ visible: true }),
  ).toHaveValue("Bring the paperback");
});
