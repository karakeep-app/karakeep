import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { createWebTestUser, it, signIn } from "../../utils/browser";

it("adds a bookmark through the list dialog and finds it in the list", async ({
  page,
}) => {
  const { trpc, email } = await createWebTestUser();
  const list = await trpc.lists.create.mutate({
    name: "Weekend reading",
    icon: "📚",
  });
  await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Read this over the weekend",
  });
  await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Keep this outside the list",
  });
  await signIn(page, email);

  const cards = page.locator("[data-bookmark-index]").filter({ visible: true });
  const bookmark = cards.filter({ hasText: "Read this over the weekend" });
  await bookmark.locator('button[aria-haspopup="menu"]').click();
  await page
    .getByRole("menuitem", { name: "Manage Lists", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Manage Lists" });
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Weekend reading/ }).click();
  await expect(dialog.getByRole("listitem")).toContainText("Weekend reading");
  // Both the footer button and the corner icon are named Close.
  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole("link", { name: /Weekend reading/ }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/lists/${list.id}$`));
  await expect(
    page.getByRole("heading", { name: "Weekend reading" }),
  ).toBeVisible();
  await expect(bookmark).toBeVisible();
  await expect(cards).toHaveCount(1);
  await page.reload();
  await expect(bookmark).toBeVisible();
  await expect(cards).toHaveCount(1);
});
