import type { Locator, Page } from "playwright/test";
import { expect } from "playwright/test";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  createWebTestUser,
  it,
  signIn,
  WORKER_TEST_TIMEOUT,
} from "../../utils/browser";
import { waitUntil } from "../../utils/general";

type WebTestUser = Awaited<ReturnType<typeof createWebTestUser>>;

// The crawled http://nginx/hello.html renders "Hello World" in the reader.
const READER_TEXT = "Hello World";

// Creates a user with a link bookmark and waits until the workers have
// crawled it, so that the reader view has content to highlight.
async function seedCrawledBookmark() {
  const user = await createWebTestUser();
  const { id } = await user.trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.LINK,
    url: "http://nginx/hello.html",
  });
  let htmlContent = "";
  await waitUntil(
    async () => {
      const bookmark = await user.trpc.bookmarks.getBookmark.query({
        bookmarkId: id,
        includeContent: true,
      });
      if (bookmark.content.type !== BookmarkTypes.LINK) {
        return false;
      }
      htmlContent = bookmark.content.htmlContent ?? "";
      return htmlContent.includes(READER_TEXT);
    },
    "Bookmark is crawled",
    90000,
  );
  return { user, bookmarkId: id, htmlContent };
}

// Seeds a highlight over the first occurrence of `text` in the reader. The
// reader uses offsets into the concatenated text nodes of the HTML content.
async function seedHighlight(
  user: WebTestUser,
  bookmarkId: string,
  htmlContent: string,
  text: string,
  note: string | null = null,
) {
  const startOffset = htmlContent.replace(/<[^>]*>/g, "").indexOf(text);
  expect(startOffset).toBeGreaterThanOrEqual(0);
  return user.trpc.highlights.create.mutate({
    bookmarkId,
    startOffset,
    endOffset: startOffset + text.length,
    color: "yellow",
    text,
    note,
  });
}

// Opens the bookmark's preview page and switches it to the reader view (the
// test page has a screenshot, which is the default preview).
async function openReaderView(page: Page, bookmarkId: string) {
  await page.goto(`/dashboard/preview/${bookmarkId}`);
  await page.getByRole("combobox").filter({ hasText: "Screenshot" }).click();
  await page.getByRole("option", { name: "Reader View" }).click();
  await expect(page).toHaveURL(/section=cached/);
  const heading = page.getByRole("heading", { name: READER_TEXT });
  await expect(heading).toBeVisible();
  return heading;
}

// Selects `text` inside `container` by dragging the mouse across it, the way
// a user would. The reader opens its highlight form on pointerup.
async function dragSelectText(page: Page, container: Locator, text: string) {
  const rect = await container.evaluate((element, needle) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const index = node.data.indexOf(needle);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        const { left, right, top, bottom } = range.getBoundingClientRect();
        return { left, right, top, bottom };
      }
    }
    return null;
  }, text);
  if (!rect) {
    throw new Error(`"${text}" was not found`);
  }
  const y = (rect.top + rect.bottom) / 2;
  await page.mouse.move(rect.left + 1, y);
  await page.mouse.down();
  await page.mouse.move(rect.right - 1, y, { steps: 5 });
  await page.mouse.up();
}

function highlightForm(page: Page) {
  return page
    .getByRole("dialog")
    .filter({ has: page.getByPlaceholder("Add a note (optional)...") });
}

// Highlight cards render the highlighted text in a blockquote, with the note
// and a delete button next to it.
function highlightCard(scope: Page | Locator, text: string) {
  return scope.locator("blockquote", { hasText: text }).locator("xpath=../..");
}

it(
  "highlights selected text in the reader with a note",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { user, bookmarkId } = await seedCrawledBookmark();
    await signIn(page, user.email);
    const heading = await openReaderView(page, bookmarkId);

    await dragSelectText(page, heading, "World");
    const form = highlightForm(page);
    await expect(form).toBeVisible();
    await form
      .getByPlaceholder("Add a note (optional)...")
      .fill("The classic greeting");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText("Highlight has been created!")).toBeVisible();

    const mark = heading.locator("span[data-highlight]");
    await expect(mark).toHaveText("World");
    await expect(highlightCard(page, "World")).toContainText(
      "The classic greeting",
    );

    const { highlights } = await user.trpc.highlights.getForBookmark.query({
      bookmarkId,
    });
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toMatchObject({
      text: "World",
      note: "The classic greeting",
      color: "yellow",
    });

    await page.reload();
    await expect(mark).toHaveText("World");
    await expect(highlightCard(page, "World")).toContainText(
      "The classic greeting",
    );

    await page.getByRole("link", { name: "Highlights", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/highlights$/);
    const card = highlightCard(page, "World");
    await expect(card).toContainText("The classic greeting");
    await page.getByRole("link", { name: "Source", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/preview/${bookmarkId}`),
    );
  },
);

it(
  "edits a highlight's note and deletes it from the reader",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { user, bookmarkId, htmlContent } = await seedCrawledBookmark();
    const highlight = await seedHighlight(
      user,
      bookmarkId,
      htmlContent,
      "Hello",
      "First note",
    );
    await signIn(page, user.email);
    const heading = await openReaderView(page, bookmarkId);

    const mark = heading.locator("span[data-highlight]");
    await expect(mark).toHaveText("Hello");
    await mark.click();
    const form = highlightForm(page);
    const note = form.getByPlaceholder("Add a note (optional)...");
    await expect(note).toHaveValue("First note");
    await note.fill("Updated note");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText("Highlight has been updated!")).toBeVisible();
    await expect(highlightCard(page, "Hello")).toContainText("Updated note");
    await expect
      .poll(
        async () =>
          (
            await user.trpc.highlights.get.query({
              highlightId: highlight.id,
            })
          ).note,
      )
      .toBe("Updated note");

    await mark.click();
    await expect(note).toHaveValue("Updated note");
    await form.getByRole("button", { name: "Delete highlight" }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText("Highlight has been deleted!")).toBeVisible();
    await expect(mark).toHaveCount(0);
    await expect(page.locator("blockquote", { hasText: "Hello" })).toHaveCount(
      0,
    );

    await page.reload();
    await expect(heading).toBeVisible();
    await expect(mark).toHaveCount(0);
    const { highlights } = await user.trpc.highlights.getForBookmark.query({
      bookmarkId,
    });
    expect(highlights).toHaveLength(0);
  },
);

it(
  "deletes a highlight from the highlights page",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { user, bookmarkId, htmlContent } = await seedCrawledBookmark();
    await seedHighlight(user, bookmarkId, htmlContent, "Hello", "Keep this");
    await seedHighlight(user, bookmarkId, htmlContent, "World", "Drop this");
    await signIn(page, user.email);

    await page.goto("/dashboard/highlights");
    const keep = highlightCard(page, "Hello");
    const drop = highlightCard(page, "World");
    await expect(keep).toContainText("Keep this");
    await expect(drop).toContainText("Drop this");

    // The delete button is the only button in a card on this page.
    await drop.getByRole("button").click();
    await expect(page.getByText("Highlight has been deleted!")).toBeVisible();
    await expect(drop).toHaveCount(0);
    await expect(keep).toBeVisible();

    await page.reload();
    await expect(keep).toContainText("Keep this");
    await expect(drop).toHaveCount(0);
    const { highlights } = await user.trpc.highlights.getForBookmark.query({
      bookmarkId,
    });
    expect(highlights.map((h) => h.text)).toEqual(["Hello"]);
  },
);
