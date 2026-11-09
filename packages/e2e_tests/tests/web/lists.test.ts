import type { Page } from "playwright/test";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  bookmarkCards,
  createWebTestUser,
  goto,
  it,
  reload,
  signIn,
} from "../../utils/browser";

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
    .getByRole("menuitem", { name: "Manage lists", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Manage lists" });
  const option = dialog.getByRole("option", { name: /Weekend reading/ });
  await option.click();
  await expect(option).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole("link", { name: /Weekend reading/ }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/lists/${list.id}$`));
  await expect(
    page.getByRole("heading", { name: "Weekend reading" }),
  ).toBeVisible();
  await expect(bookmark).toBeVisible();
  await expect(cards).toHaveCount(1);
  await reload(page);
  await expect(bookmark).toBeVisible();
  await expect(cards).toHaveCount(1);
});

function sidebarOf(page: Page) {
  return page.getByRole("complementary").filter({ visible: true });
}

function sidebarListItem(page: Page, name: string | RegExp) {
  return sidebarOf(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name }) });
}

// The "..." menu next to the list's title in the list view.
function listHeaderOptions(page: Page, listName: string) {
  return page
    .getByRole("main")
    .locator("div")
    .filter({
      has: page.getByRole("heading", { level: 1, name: listName, exact: true }),
    })
    .filter({ has: page.locator('button[aria-haspopup="menu"]') })
    .last()
    .locator('button[aria-haspopup="menu"]');
}

it("creates a list from the sidebar and shows it on All Lists", async ({
  page,
}) => {
  const { trpc, email } = await createWebTestUser();
  await signIn(page, email);

  await sidebarOf(page).getByRole("button", { name: "New list" }).click();
  const dialog = page.getByRole("dialog", { name: "New list" });
  await dialog.getByPlaceholder("List name").fill("Recipes to try");
  await dialog.getByLabel("Description (optional)").fill("Dinner ideas");
  await dialog
    .getByRole("button", { name: "Create list", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();

  await expect(
    page.getByRole("heading", { level: 1, name: "Recipes to try" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByText("Dinner ideas")).toBeVisible();
  await expect(sidebarListItem(page, /Recipes to try/)).toBeVisible();

  const { lists } = await trpc.lists.list.query();
  expect(lists).toHaveLength(1);
  expect(lists[0]).toMatchObject({
    name: "Recipes to try",
    description: "Dinner ideas",
    type: "manual",
    parentId: null,
  });
  await expect(page).toHaveURL(new RegExp(`/dashboard/lists/${lists[0].id}$`));

  await sidebarOf(page)
    .getByRole("link", { name: /All lists/ })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/lists$/);
  await expect(
    page.getByRole("main").getByRole("link", { name: /Recipes to try/ }),
  ).toBeVisible();
  await reload(page);
  await expect(
    page.getByRole("main").getByRole("link", { name: /Recipes to try/ }),
  ).toBeVisible();
});

it("creates a nested list under a parent list", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  const parent = await trpc.lists.create.mutate({
    name: "Travel",
    icon: "✈️",
  });
  await signIn(page, email);

  await sidebarOf(page).getByRole("button", { name: "New list" }).click();
  const dialog = page.getByRole("dialog", { name: "New list" });
  await dialog.getByPlaceholder("List name").fill("Japan trip");
  await dialog.getByRole("combobox").filter({ hasText: "No parent" }).click();
  await page.getByRole("option", { name: /Travel/ }).click();
  await expect(
    dialog.getByRole("combobox").filter({ hasText: "Travel" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create list", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Japan trip" }),
  ).toBeVisible();

  const { lists } = await trpc.lists.list.query();
  const child = lists.find((l) => l.name === "Japan trip");
  expect(child?.parentId).toBe(parent.id);

  // Viewing the child expands its parent in the sidebar, indented one level.
  await expect(sidebarListItem(page, /Japan trip/)).toBeVisible();
  await expect(sidebarListItem(page, /Japan trip/)).toHaveCSS(
    "margin-left",
    "16px",
  );
  await expect(sidebarListItem(page, /Travel/)).toHaveCSS("margin-left", "0px");

  // On All Lists, the child is hidden until the parent is expanded.
  await sidebarOf(page)
    .getByRole("link", { name: /All lists/ })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/lists$/);
  const main = page.getByRole("main");
  const parentRow = main
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: /Travel/ }) });
  await expect(parentRow).toBeVisible();
  await expect(main.getByRole("link", { name: /Japan trip/ })).toHaveCount(0);
  // The expand chevron is a button acting as the collapsible trigger. The ⋯
  // menu trigger also has aria-expanded, but it's marked as a popup.
  const expand = parentRow.locator(
    "button[aria-expanded]:not([aria-haspopup])",
  );
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(main.getByRole("link", { name: /Japan trip/ })).toBeVisible();
});

it("removes a bookmark from a list through the card menu", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  const list = await trpc.lists.create.mutate({
    name: "Reading queue",
    icon: "📖",
  });
  for (const text of ["Keep me in the queue", "Take me out of the queue"]) {
    const bookmark = await trpc.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.TEXT,
      text,
    });
    await trpc.lists.addToList.mutate({
      listId: list.id,
      bookmarkId: bookmark.id,
    });
  }
  await signIn(page, email);
  await goto(page, `/dashboard/lists/${list.id}`);

  const cards = bookmarkCards(page);
  await expect(cards).toHaveCount(2);
  await cards
    .filter({ hasText: "Take me out of the queue" })
    .locator('button[aria-haspopup="menu"]')
    .click();
  await page
    .getByRole("menuitem", { name: "Remove from list", exact: true })
    .click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Keep me in the queue");

  await reload(page);
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Keep me in the queue");
  const inList = await trpc.bookmarks.getBookmarks.query({ listId: list.id });
  expect(inList.bookmarks).toHaveLength(1);
  // Removing from a list must not delete the bookmark itself.
  const all = await trpc.bookmarks.getBookmarks.query({});
  expect(all.bookmarks).toHaveLength(2);
});

it("creates a smart list that shows only matching bookmarks", async ({
  page,
}) => {
  const { trpc, email } = await createWebTestUser();
  const tagged = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Hike the ridge trail",
  });
  await trpc.bookmarks.updateTags.mutate({
    bookmarkId: tagged.id,
    attach: [{ tagName: "weekend" }],
    detach: [],
  });
  await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "File the tax return",
  });
  await signIn(page, email);

  await sidebarOf(page).getByRole("button", { name: "New list" }).click();
  const dialog = page.getByRole("dialog", { name: "New list" });
  await dialog.getByPlaceholder("List name").fill("Weekend plans");
  await dialog.getByRole("combobox").filter({ hasText: "Manual list" }).click();
  await page.getByRole("option", { name: "Smart list", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Tags" }).click();
  await page.getByRole("option", { name: "weekend", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("1 bookmark matches")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create list", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();

  await expect(
    page.getByRole("heading", { level: 1, name: "Weekend plans" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Smart list" }),
  ).toBeVisible();
  const cards = bookmarkCards(page);
  await expect(cards.filter({ hasText: "Hike the ridge trail" })).toBeVisible();
  await expect(cards).toHaveCount(1);

  await reload(page);
  await expect(cards.filter({ hasText: "Hike the ridge trail" })).toBeVisible();
  await expect(cards).toHaveCount(1);
  const { lists } = await trpc.lists.list.query();
  expect(lists).toHaveLength(1);
  expect(lists[0]).toMatchObject({ type: "smart", query: "tag:weekend" });
});

it("renames and then deletes a list from its options menu", async ({
  page,
}) => {
  const { trpc, email } = await createWebTestUser();
  const list = await trpc.lists.create.mutate({
    name: "Old ideas",
    icon: "💡",
  });
  const bookmark = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "An idea worth keeping",
  });
  await trpc.lists.addToList.mutate({
    listId: list.id,
    bookmarkId: bookmark.id,
  });
  await signIn(page, email);
  await goto(page, `/dashboard/lists/${list.id}`);

  await listHeaderOptions(page, "Old ideas").click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit list" });
  await expect(editDialog.getByPlaceholder("List name")).toHaveValue(
    "Old ideas",
  );
  await editDialog.getByPlaceholder("List name").fill("Fresh ideas");
  await editDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Fresh ideas" }),
  ).toBeVisible();
  await expect(sidebarListItem(page, /Fresh ideas/)).toBeVisible();
  await expect(sidebarListItem(page, /Old ideas/)).toHaveCount(0);
  await reload(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Fresh ideas" }),
  ).toBeVisible();

  await listHeaderOptions(page, "Fresh ideas").click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete list" });
  await expect(deleteDialog).toContainText("Delete 💡 Fresh ideas?");
  await deleteDialog
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/lists$/);
  await expect(sidebarListItem(page, /Fresh ideas/)).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("link", { name: /Fresh ideas/ }),
  ).toHaveCount(0);

  const { lists } = await trpc.lists.list.query();
  expect(lists).toHaveLength(0);
  // Deleting a list keeps the bookmarks that were in it.
  const all = await trpc.bookmarks.getBookmarks.query({});
  expect(all.bookmarks.map((b) => b.id)).toEqual([bookmark.id]);
});

it("makes a list public and opens it while logged out", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  const list = await trpc.lists.create.mutate({
    name: "Best of the web",
    icon: "🌐",
  });
  const bookmark = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "A note everyone should read",
  });
  await trpc.lists.addToList.mutate({
    listId: list.id,
    bookmarkId: bookmark.id,
  });
  await signIn(page, email);
  await goto(page, `/dashboard/lists/${list.id}`);

  const browser = page.context().browser();
  if (!browser) {
    throw new Error("The page is expected to belong to a browser");
  }
  const anonContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    locale: "en-US",
  });
  try {
    const anonPage = await anonContext.newPage();
    const publicPath = `/public/lists/${list.id}`;
    // Private lists aren't reachable through the public URL.
    await goto(anonPage, publicPath);
    await expect(
      anonPage.getByRole("heading", { name: "List not found" }),
    ).toBeVisible();

    await listHeaderOptions(page, "Best of the web").click();
    await page
      .getByRole("menuitem", { name: "Share list", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Share list" });
    const publicSwitch = dialog.getByRole("switch", { name: "Public list" });
    await expect(publicSwitch).not.toBeChecked();
    await publicSwitch.click();
    await expect(publicSwitch).toBeChecked();
    await expect(dialog.getByRole("textbox").first()).toHaveValue(
      new RegExp(`${publicPath}$`),
    );
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("main").getByText("Public", { exact: true }),
    ).toBeVisible();
    expect((await trpc.lists.get.query({ listId: list.id })).public).toBe(true);

    await goto(anonPage, publicPath);
    await expect(
      anonPage.getByRole("heading", { level: 1, name: "Best of the web" }),
    ).toBeVisible();
    await expect(
      anonPage.getByText("A note everyone should read"),
    ).toBeVisible();
    await expect(anonPage.getByText("Created by")).toBeVisible();
  } finally {
    await anonContext.close();
  }
});

it("invites a collaborator who accepts and sees the list", async ({ page }) => {
  const owner = await createWebTestUser();
  const collaborator = await createWebTestUser();
  const list = await owner.trpc.lists.create.mutate({
    name: "Team picks",
    icon: "🤝",
  });
  const bookmark = await owner.trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Shared with the team",
  });
  await owner.trpc.lists.addToList.mutate({
    listId: list.id,
    bookmarkId: bookmark.id,
  });
  await signIn(page, owner.email);
  await goto(page, `/dashboard/lists/${list.id}`);

  await listHeaderOptions(page, "Team picks").click();
  await page
    .getByRole("menuitem", { name: "Manage collaborators", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: /Manage collaborators/ });
  await dialog.getByPlaceholder("Enter email address").fill(collaborator.email);
  await dialog.getByPlaceholder("Enter email address").press("Enter");
  await expect(dialog.getByText(collaborator.email)).toBeVisible();
  await expect(dialog.getByText("Pending", { exact: true })).toBeVisible();

  const browser = page.context().browser();
  if (!browser) {
    throw new Error("The page is expected to belong to a browser");
  }
  const otherContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  try {
    const otherPage = await otherContext.newPage();
    otherPage.setDefaultTimeout(10000);
    await signIn(otherPage, collaborator.email);

    // The sidebar badge counts pending invitations.
    const allLists = sidebarListItem(otherPage, /All lists/);
    await expect(allLists).toContainText("1");
    await allLists.getByRole("link").click();
    await expect(otherPage).toHaveURL(/\/dashboard\/lists$/);
    const main = otherPage.getByRole("main");
    await expect(main.getByText("Pending invitations")).toBeVisible();
    await expect(main.getByText("Team picks")).toBeVisible();
    await main.getByRole("button", { name: "Accept", exact: true }).click();

    await expect(main.getByText("Pending invitations")).toHaveCount(0);
    await expect(allLists).not.toContainText("1");
    await expect(
      main.getByRole("heading", { name: "Shared lists" }),
    ).toBeVisible();
    await main.getByRole("link", { name: /Team picks/ }).click();
    await expect(otherPage).toHaveURL(
      new RegExp(`/dashboard/lists/${list.id}$`),
    );
    await expect(
      otherPage.getByRole("heading", { level: 1, name: "Team picks" }),
    ).toBeVisible();
    const cards = bookmarkCards(otherPage);
    await expect(
      cards.filter({ hasText: "Shared with the team" }),
    ).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(sidebarListItem(otherPage, /Shared lists/)).toBeVisible();
    await expect(sidebarListItem(otherPage, /Team picks/)).toBeVisible();
  } finally {
    await otherContext.close();
  }

  const { collaborators } = await owner.trpc.lists.getCollaborators.query({
    listId: list.id,
  });
  expect(collaborators).toHaveLength(1);
  expect(collaborators[0]).toMatchObject({
    status: "accepted",
    role: "viewer",
  });
});
