import { readFile } from "node:fs/promises";
import type { Download, Page } from "playwright/test";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  bookmarkCards,
  createWebTestUser,
  goto,
  it,
  reload,
  signIn,
  WORKER_TEST_TIMEOUT,
} from "../../utils/browser";

async function exportBookmarks(page: Page): Promise<string> {
  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const path = await download.path();
  return readFile(path, "utf-8");
}

const NETSCAPE_FILE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Research</H3>
  <DL><p>
    <DT><A HREF="http://nginx:80/hello.html?imported=1" ADD_DATE="1700000000" TAGS="imported,web">Imported research page</A>
  </DL><p>
  <DT><A HREF="http://nginx:80/hello.html?imported=2" ADD_DATE="1700000100">Imported top level page</A>
</DL><p>
`;

it("exports bookmarks as Karakeep JSON and Netscape HTML", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  const note = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Remember to export me",
  });
  await trpc.bookmarks.updateTags.mutate({
    bookmarkId: note.id,
    attach: [{ tagName: "exported" }],
    detach: [],
  });
  await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.LINK,
    url: "http://nginx:80/hello.html?exported=1",
  });
  await signIn(page, email);

  await goto(page, "/settings/import");
  await expect(
    page.getByRole("heading", { name: "Import / export", exact: true }),
  ).toBeVisible();

  const json = JSON.parse(await exportBookmarks(page)) as {
    bookmarks: {
      tags: string[];
      content: { type: string; text?: string; url?: string } | null;
    }[];
  };
  expect(json.bookmarks).toHaveLength(2);
  expect(json.bookmarks).toContainEqual(
    expect.objectContaining({
      tags: ["exported"],
      content: { type: "text", text: "Remember to export me" },
    }),
  );
  expect(json.bookmarks).toContainEqual(
    expect.objectContaining({
      content: { type: "link", url: "http://nginx:80/hello.html?exported=1" },
    }),
  );

  await page.getByRole("combobox").filter({ hasText: "JSON" }).click();
  await page
    .getByRole("option", { name: "HTML (Netscape format)", exact: true })
    .click();
  const html = await exportBookmarks(page);
  expect(html).toMatch(/^<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
  expect(html).toContain('HREF="http://nginx:80/hello.html?exported=1"');
  // Netscape exports only contain links.
  expect(html).not.toContain("Remember to export me");
});

// The session only completes once the imported links have been crawled, which
// can take a while when the workers are busy.
it(
  "imports a Netscape HTML bookmarks file",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { trpc, email } = await createWebTestUser();
    await signIn(page, email);

    await goto(page, "/settings/import");
    await expect(page.getByText("No import sessions yet")).toBeVisible();

    const htmlCard = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: "HTML file" }) })
      .filter({ has: page.locator('input[type="file"]') })
      .last();
    await htmlCard.locator('input[type="file"]').setInputFiles({
      name: "bookmarks.html",
      mimeType: "text/html",
      buffer: Buffer.from(NETSCAPE_FILE),
    });
    await expect(
      page.getByText(
        "Staged 2 bookmarks for import. Background processing will start automatically.",
      ),
    ).toBeVisible({ timeout: 30000 });

    const session = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: /^Html Import - / }) })
      .filter({ hasText: "Progress" })
      .last();
    await expect(session).toBeVisible();
    // The card polls the session stats until the import finishes.
    await expect(session).toContainText("Completed", { timeout: 120000 });
    await expect(session).toContainText("2 / 2");

    const { bookmarks } = await trpc.bookmarks.getBookmarks.query({});
    expect(bookmarks.map((b) => b.title).sort()).toEqual([
      "Imported research page",
      "Imported top level page",
    ]);
    const research = bookmarks.find(
      (b) => b.title === "Imported research page",
    );
    expect(research?.tags.map((t) => t.name).sort()).toEqual([
      "imported",
      "web",
    ]);

    // The folder structure is recreated under an "Imported bookmarks" list.
    const { lists } = await trpc.lists.list.query();
    const root = lists.find((l) => l.name === "Imported bookmarks");
    const folder = lists.find((l) => l.name === "Research");
    expect(root).toBeDefined();
    expect(folder?.parentId).toBe(root?.id);

    await goto(page, "/dashboard/bookmarks");
    const cards = bookmarkCards(page);
    await expect(
      cards.filter({ hasText: "Imported research page" }),
    ).toBeVisible();
    await expect(
      cards.filter({ hasText: "Imported top level page" }),
    ).toBeVisible();
  },
);

it(
  "subscribes to an RSS feed, fetches it, then disables and deletes it",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { trpc, email } = await createWebTestUser();
    await signIn(page, email);

    await goto(page, "/settings/feeds");
    await expect(
      page.getByText("You don't have any RSS subscriptions yet."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "New subscription", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Subscribe to a new Feed",
    });
    await dialog.getByLabel("Name", { exact: true }).fill("Test blog");
    await dialog
      .getByLabel("URL", { exact: true })
      .fill("http://nginx:80/feed.xml");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Feed has been created!")).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "Test blog" });
    await expect(row).toContainText("http://nginx:80/feed.xml");
    await expect(row.getByRole("switch")).toBeChecked();
    const [feed] = (await trpc.feeds.list.query()).feeds;

    // The fetch button is icon-only; its tooltip identifies it.
    const fetchButton = row.getByRole("button").nth(1);
    await fetchButton.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Fetch now");
    await fetchButton.click();
    await expect(page.getByText("Feed fetch has been enqueued!")).toBeVisible();
    await expect
      .poll(
        async () =>
          (await trpc.feeds.get.query({ feedId: feed.id })).lastFetchedStatus,
        { timeout: 90000 },
      )
      .toBe("success");
    await reload(page);
    await expect(row.getByTitle("Successful")).toBeVisible();

    await row.getByRole("link", { name: "Test blog" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/feeds/${feed.id}$`));
    const cards = bookmarkCards(page);
    await expect(cards.filter({ hasText: "First Test Article" })).toBeVisible();
    await expect(
      cards.filter({ hasText: "Second Test Article" }),
    ).toBeVisible();

    await goto(page, "/settings/feeds");
    await row.getByRole("switch").click();
    await expect(page.getByText("RSS feed disabled")).toBeVisible();
    await expect(row.getByRole("switch")).not.toBeChecked();
    expect((await trpc.feeds.get.query({ feedId: feed.id })).enabled).toBe(
      false,
    );

    await row.getByRole("button").last().click();
    const confirm = page.getByRole("dialog", {
      name: 'Delete Feed "Test blog"?',
    });
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).not.toBeVisible();
    await expect(
      page.getByText("You don't have any RSS subscriptions yet."),
    ).toBeVisible();
    expect((await trpc.feeds.list.query()).feeds).toHaveLength(0);
  },
);
