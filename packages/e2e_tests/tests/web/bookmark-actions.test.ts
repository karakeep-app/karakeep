import type { Page } from "playwright/test";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  bookmarkCards,
  bookmarkEditor,
  createWebTestUser,
  goto,
  it,
  reload,
  signIn,
  waitForHydration,
  waitForTaggingToFinish,
  WORKER_TEST_TIMEOUT,
} from "../../utils/browser";

type WebTestUser = Awaited<ReturnType<typeof createWebTestUser>>;

// Creates a user with one text bookmark per entry in `texts`.
async function seedTextBookmarks(texts: string[]) {
  const user = await createWebTestUser();
  const ids: string[] = [];
  for (const text of texts) {
    const bookmark = await user.trpc.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.TEXT,
      text,
    });
    ids.push(bookmark.id);
  }
  return { ...user, ids };
}

async function signInAndWaitForCards(page: Page, email: string, n: number) {
  await signIn(page, email);
  await expect(bookmarkCards(page)).toHaveCount(n);
}

function cardWithText(page: Page, text: string) {
  return bookmarkCards(page).filter({ hasText: text });
}

function bulkToolbar(page: Page) {
  return page.getByRole("toolbar", { name: "Bulk Edit", exact: true });
}

// Enters bulk-edit mode through the first card's hover button and then
// selects the remaining cards through their selection overlays.
async function selectInBulk(page: Page, texts: string[]) {
  const [first, ...rest] = texts;
  const firstCard = cardWithText(page, first);
  await firstCard.hover();
  await firstCard
    .getByRole("button", { name: "Bulk Edit", exact: true })
    .click();
  await expect(bulkToolbar(page)).toBeVisible();
  for (const text of rest) {
    const overlay = cardWithText(page, text).getByRole("button", {
      name: "Select",
      exact: true,
    });
    await overlay.click();
    await expect(overlay).toHaveAttribute("aria-pressed", "true");
  }
}

// The desktop bulk toolbar buttons are icon-only and are only named by their
// tooltips. Focusing a button opens its tooltip (hovering from one button to
// the next doesn't reliably), so focus each one until its tooltip matches.
async function clickBulkAction(page: Page, name: string) {
  const buttons = bulkToolbar(page).locator("button:visible");
  await expect(buttons.first()).toBeVisible();
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    await button.focus();
    await expect(button).toHaveAttribute("aria-describedby", /.+/);
    const tooltipId = await button.getAttribute("aria-describedby");
    const tooltip = page.locator(`[id="${tooltipId}"]`);
    if ((await tooltip.textContent())?.trim() === name) {
      await button.click();
      return;
    }
  }
  throw new Error(`No bulk action named "${name}"`);
}

async function getBookmarks(user: WebTestUser, ids: string[]) {
  return Promise.all(
    ids.map((bookmarkId) =>
      user.trpc.bookmarks.getBookmark.query({ bookmarkId }),
    ),
  );
}

it("edits a bookmark's title from the card menu", async ({ page }) => {
  const user = await seedTextBookmarks(["Notes from the meetup"]);
  await signInAndWaitForCards(page, user.email, user.ids.length);
  const card = bookmarkCards(page);
  await card.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Edit Bookmark" });
  await dialog.getByLabel("Title", { exact: true }).fill("Meetup recap");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText("Meetup recap");

  await reload(page);
  await expect(card).toContainText("Meetup recap");
  const [bookmark] = await getBookmarks(user, user.ids);
  expect(bookmark.title).toBe("Meetup recap");
});

it("adds and edits a note on the preview page", async ({ page }) => {
  const user = await seedTextBookmarks(["A recipe for pancakes"]);
  await signInAndWaitForCards(page, user.email, user.ids.length);
  const [bookmarkId] = user.ids;
  await goto(page, `/dashboard/preview/${bookmarkId}`);
  const note = page
    .getByPlaceholder("Write some notes ...")
    .filter({ visible: true });
  await waitForHydration(note);
  await expect(note).toHaveValue("");

  // The note is saved when the textarea loses focus.
  await note.fill("Use buttermilk");
  await note.blur();
  await expect(page.getByText("The bookmark has been updated!")).toBeVisible();
  await reload(page);
  await waitForHydration(note);
  await expect(note).toHaveValue("Use buttermilk");

  await note.fill("Use buttermilk and a pinch of salt");
  await note.blur();
  await expect
    .poll(async () => (await getBookmarks(user, [bookmarkId]))[0].note)
    .toBe("Use buttermilk and a pinch of salt");
  await reload(page);
  await expect(note).toHaveValue("Use buttermilk and a pinch of salt");
});

it("creates a text note from the editor card", async ({ page }) => {
  const user = await createWebTestUser();
  await signIn(page, user.email);
  await bookmarkEditor(page).fill("Call the plumber");
  await page.getByRole("button", { name: /^Save/ }).click();

  const card = bookmarkCards(page);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Call the plumber");
  await expect(bookmarkEditor(page)).toHaveValue("");

  await reload(page);
  await expect(card).toContainText("Call the plumber");
  const { bookmarks } = await user.trpc.bookmarks.getBookmarks.query({});
  expect(bookmarks).toHaveLength(1);
  expect(bookmarks[0].content).toMatchObject({
    type: BookmarkTypes.TEXT,
    text: "Call the plumber",
  });
});

it("favourites the selected bookmarks in bulk", async ({ page }) => {
  const texts = ["Bulk one", "Bulk two", "Left alone"];
  const user = await seedTextBookmarks(texts);
  await signInAndWaitForCards(page, user.email, user.ids.length);
  await selectInBulk(page, ["Bulk one", "Bulk two"]);
  await clickBulkAction(page, "Favorite");
  await expect(bulkToolbar(page)).toHaveCount(0);
  await expect(page.getByText("2 bookmarks have been updated!")).toBeVisible();

  const bookmarks = await getBookmarks(user, user.ids);
  expect(bookmarks.map((b) => b.favourited)).toEqual([true, true, false]);

  await page.getByRole("link", { name: /Favourites/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/favourites$/);
  await expect(bookmarkCards(page)).toHaveCount(2);
  await expect(cardWithText(page, "Left alone")).toHaveCount(0);
});

it("archives the selected bookmarks in bulk", async ({ page }) => {
  const texts = ["Old news", "Older news", "Fresh news"];
  const user = await seedTextBookmarks(texts);
  await signInAndWaitForCards(page, user.email, user.ids.length);
  await selectInBulk(page, ["Old news", "Older news"]);
  await clickBulkAction(page, "Archive");
  await expect(bookmarkCards(page)).toHaveCount(1);
  await expect(bookmarkCards(page)).toContainText("Fresh news");

  const bookmarks = await getBookmarks(user, user.ids);
  expect(bookmarks.map((b) => b.archived)).toEqual([true, true, false]);

  await page.getByRole("link", { name: "Archive", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/archive$/);
  await expect(bookmarkCards(page)).toHaveCount(2);
});

it("selects all bookmarks and deletes them in bulk", async ({ page }) => {
  const texts = ["Expired coupon", "Old receipt", "Spam newsletter"];
  const user = await seedTextBookmarks(texts);
  await signInAndWaitForCards(page, user.email, user.ids.length);
  await selectInBulk(page, ["Expired coupon"]);
  await clickBulkAction(page, "Select All");
  for (const text of texts.slice(1)) {
    await expect(
      cardWithText(page, text).getByRole("button", {
        name: "Select",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await clickBulkAction(page, "Delete");
  await page
    .getByRole("dialog", { name: "Delete Bookmarks" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(bookmarkCards(page)).toHaveCount(0);

  await reload(page);
  await expect(bookmarkEditor(page)).toBeVisible();
  await expect(bookmarkCards(page)).toHaveCount(0);
  const { bookmarks } = await user.trpc.bookmarks.getBookmarks.query({});
  expect(bookmarks).toHaveLength(0);
});

it("adds the selected bookmarks to a list in bulk", async ({ page }) => {
  const texts = ["Trip packing list", "Trip itinerary", "Grocery list"];
  const user = await seedTextBookmarks(texts);
  const list = await user.trpc.lists.create.mutate({
    name: "Summer trip",
    icon: "🏖️",
  });
  await signInAndWaitForCards(page, user.email, user.ids.length);
  await selectInBulk(page, ["Trip packing list", "Trip itinerary"]);
  await clickBulkAction(page, "Add to List");

  const dialog = page.getByRole("dialog", { name: "Add 2 bookmarks to List" });
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Summer trip/ }).click();
  await expect(dialog.getByRole("combobox")).toContainText("Summer trip");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("2 bookmarks have been added to the list!"),
  ).toBeVisible();

  const { bookmarks } = await user.trpc.bookmarks.getBookmarks.query({
    listId: list.id,
  });
  expect(bookmarks.map((b) => b.id).sort()).toEqual(
    user.ids.slice(0, 2).sort(),
  );

  await goto(page, `/dashboard/lists/${list.id}`);
  await expect(bookmarkCards(page)).toHaveCount(2);
  await expect(cardWithText(page, "Grocery list")).toHaveCount(0);
});

it(
  "tags the selected bookmarks in bulk",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const texts = ["Sourdough starter", "Focaccia recipe", "Car insurance"];
    const user = await seedTextBookmarks(texts);
    await signInAndWaitForCards(page, user.email, user.ids.length);
    await selectInBulk(page, ["Sourdough starter", "Focaccia recipe"]);
    await clickBulkAction(page, "Edit Tags");

    const dialog = page.getByRole("dialog", {
      name: "Edit Tags of 2 Bookmarks",
    });
    const tagInput = dialog.getByPlaceholder("Search or create tags...");
    await tagInput.click();
    await tagInput.fill("baking");
    // The tag doesn't exist yet, so the only option is the one creating it.
    await page.getByRole("option", { name: "baking", exact: true }).click();
    await expect(
      page.getByText('Tag "baking" has been added to 2 bookmarks!'),
    ).toBeVisible();
    // Close the tag suggestions first; they cover the dialog's footer.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await expect(dialog).toHaveCount(0);

    const bookmarks = await getBookmarks(user, user.ids);
    expect(bookmarks.map((b) => b.tags.map((t) => t.name))).toEqual([
      ["baking"],
      ["baking"],
      [],
    ]);
    // Cards show a skeleton instead of their tags while tagging is pending.
    for (const id of user.ids) {
      await waitForTaggingToFinish(user.trpc, id);
    }
    await reload(page);
    await expect(cardWithText(page, "Sourdough starter")).toContainText(
      "baking",
    );
    await expect(cardWithText(page, "Focaccia recipe")).toContainText("baking");
    await expect(cardWithText(page, "Car insurance")).not.toContainText(
      "baking",
    );
  },
);
