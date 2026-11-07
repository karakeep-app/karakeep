import type { Page } from "playwright/test";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  bookmarkCards,
  createWebTestUser,
  it,
  signIn,
  waitForTaggingToFinish,
  WORKER_TEST_TIMEOUT,
} from "../../utils/browser";

type TrpcClient = Awaited<ReturnType<typeof createWebTestUser>>["trpc"];

async function createTaggedBookmark(
  trpc: TrpcClient,
  text: string,
  tagNames: string[],
) {
  const bookmark = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text,
  });
  if (tagNames.length > 0) {
    await trpc.bookmarks.updateTags.mutate({
      bookmarkId: bookmark.id,
      attach: tagNames.map((tagName) => ({ tagName })),
      detach: [],
    });
  }
  return bookmark;
}

async function getTagByName(trpc: TrpcClient, name: string) {
  const { tags } = await trpc.tags.list.query({});
  return tags.find((tag) => tag.name === name);
}

async function getTagNamesOfBookmark(trpc: TrpcClient, bookmarkId: string) {
  const bookmark = await trpc.bookmarks.getBookmark.query({ bookmarkId });
  return bookmark.tags.map((tag) => tag.name).sort();
}

// Radix moves focus back to a dropdown menu's trigger shortly after the menu
// closes. When the menu opened a dialog and a popover inside that dialog is
// opened before that happens (only automation is that fast), the focus change
// dismisses the popover, so retry the interaction.
async function retryIfPopoverIsDismissed(interaction: () => Promise<void>) {
  await expect(interaction).toPass({ timeout: 15000 });
}

// The tag page header's options button is icon-only, so find it as the menu
// button closest to the tag's heading.
async function openTagOptions(page: Page, tagName: string) {
  await page
    .getByRole("heading", { level: 1, name: tagName, exact: true })
    .locator("xpath=ancestor::div[.//button[@aria-haspopup='menu']][1]")
    .locator('button[aria-haspopup="menu"]')
    .click();
}

it(
  "adds and removes tags through the bookmark edit dialog",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { trpc, email } = await createWebTestUser();
    const bookmark = await createTaggedBookmark(
      trpc,
      "Notes from the conference",
      ["obsolete"],
    );
    await waitForTaggingToFinish(trpc, bookmark.id);
    await signIn(page, email);

    const card = bookmarkCards(page);
    await expect(card).toHaveCount(1);
    await card.locator('button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Bookmark" });

    await dialog.getByRole("button", { name: "Remove obsolete" }).click();
    await expect(
      dialog.getByRole("button", { name: "Remove obsolete" }),
    ).toHaveCount(0);

    const tagInput = dialog.getByRole("combobox");
    await expect(tagInput).toHaveAttribute(
      "placeholder",
      "Search or create tags...",
    );
    await retryIfPopoverIsDismissed(async () => {
      await tagInput.click();
      await tagInput.fill("conference-2026");
      // The tag doesn't exist yet, so the only option is the one creating it.
      await page
        .getByRole("option", { name: "conference-2026", exact: true })
        .click({ timeout: 2000 });
    });
    await expect(
      dialog.getByRole("button", { name: "Remove conference-2026" }),
    ).toBeVisible();
    await expect
      .poll(() => getTagNamesOfBookmark(trpc, bookmark.id))
      .toEqual(["conference-2026"]);

    // Close the tag suggestions, which cover the dialog's buttons.
    await tagInput.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      card.getByRole("link", { name: "conference-2026", exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: "obsolete", exact: true }),
    ).toHaveCount(0);

    await page.reload();
    await expect(
      card.getByRole("link", { name: "conference-2026", exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: "obsolete", exact: true }),
    ).toHaveCount(0);
  },
);

it(
  "opens the tag page with only its bookmarks from a tag pill",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { trpc, email } = await createWebTestUser();
    const sourdough = await createTaggedBookmark(
      trpc,
      "Sourdough starter guide",
      ["recipes"],
    );
    await createTaggedBookmark(trpc, "Tax return checklist", ["finance"]);
    await waitForTaggingToFinish(trpc, sourdough.id);
    await signIn(page, email);

    const cards = bookmarkCards(page);
    await expect(cards).toHaveCount(2);
    await cards
      .filter({ hasText: "Sourdough starter guide" })
      .getByRole("link", { name: "recipes", exact: true })
      .click();

    const recipes = await getTagByName(trpc, "recipes");
    await expect(page).toHaveURL(new RegExp(`/dashboard/tags/${recipes!.id}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: "recipes", exact: true }),
    ).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Sourdough starter guide");
  },
);

it("creates a tag from the tags page", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  await signIn(page, email);
  await page.getByRole("link", { name: "Tags", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/tags$/);

  await page.getByRole("button", { name: "Create Tag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create Tag" });
  await dialog.getByLabel("Tag Name").fill("someday");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  // A freshly created tag isn't attached to anything yet.
  const tagPill = page.getByRole("link", { name: /^someday\s*0$/ });
  await expect(tagPill).toBeVisible();
  await page.reload();
  await expect(tagPill).toBeVisible();
  const tag = await getTagByName(trpc, "someday");
  expect(tag?.numBookmarks).toBe(0);
});

it("deletes a tag from the tags page", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  const bookmark = await createTaggedBookmark(trpc, "Old project notes", [
    "stale",
    "keeper",
  ]);
  await signIn(page, email);
  await page.goto("/dashboard/tags");

  const stalePill = page.getByRole("link", { name: /^stale\s*1$/ });
  await stalePill.hover();
  // The delete button that shows up on hover has no accessible name.
  await stalePill.locator("xpath=following-sibling::button").click();
  const dialog = page.getByRole("dialog", { name: "Delete stale?" });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(stalePill).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("link", { name: /^keeper\s*1$/ })).toBeVisible();
  await expect(stalePill).toHaveCount(0);
  expect(await getTagByName(trpc, "stale")).toBeUndefined();
  expect(await getTagNamesOfBookmark(trpc, bookmark.id)).toEqual(["keeper"]);
});

it(
  "renames a tag from its tag page",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { trpc, email } = await createWebTestUser();
    const chapter = await createTaggedBookmark(trpc, "Chapter one", ["draft"]);
    await waitForTaggingToFinish(trpc, chapter.id);
    const draft = await getTagByName(trpc, "draft");
    await signIn(page, email);
    await page.goto(`/dashboard/tags/${draft!.id}`);

    await openTagOptions(page, "draft");
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Rename Tag" });
    await expect(dialog.getByLabel("Tag Name")).toHaveValue("draft");
    await dialog.getByLabel("Tag Name").fill("published");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    const heading = page.getByRole("heading", {
      level: 1,
      name: "published",
      exact: true,
    });
    await expect(heading).toBeVisible();
    await page.reload();
    await expect(heading).toBeVisible();
    const card = bookmarkCards(page);
    await expect(card).toHaveCount(1);
    await expect(
      card.getByRole("link", { name: "published", exact: true }),
    ).toBeVisible();
    expect(await getTagByName(trpc, "draft")).toBeUndefined();
  },
);

it("merges a tag into another from its tag page", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  const first = await createTaggedBookmark(trpc, "Closures in depth", ["js"]);
  const second = await createTaggedBookmark(trpc, "Event loop explained", [
    "javascript",
  ]);
  const js = await getTagByName(trpc, "js");
  const javascript = await getTagByName(trpc, "javascript");
  await signIn(page, email);
  await page.goto(`/dashboard/tags/${js!.id}`);

  await openTagOptions(page, "js");
  await page.getByRole("menuitem", { name: "Merge", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Merge Tag" });
  await retryIfPopoverIsDismissed(async () => {
    if ((await page.getByRole("listbox").count()) === 0) {
      await dialog.getByRole("combobox").click();
    }
    await page
      .getByRole("option", { name: "javascript", exact: true })
      .click({ timeout: 2000 });
  });
  await expect(dialog.getByRole("combobox")).toHaveText("javascript");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  // Merging away the tag that's being viewed moves to the merged-into tag.
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/tags/${javascript!.id}$`),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "javascript", exact: true }),
  ).toBeVisible();
  const cards = bookmarkCards(page);
  await expect(cards).toHaveCount(2);
  expect(await getTagByName(trpc, "js")).toBeUndefined();
  expect(await getTagNamesOfBookmark(trpc, first.id)).toEqual(["javascript"]);
  expect(await getTagNamesOfBookmark(trpc, second.id)).toEqual(["javascript"]);
});
