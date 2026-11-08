import { expect } from "playwright/test";
import { inject } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { getAuthHeader } from "../../utils/api";
import {
  bookmarkCards,
  createWebTestUser,
  goto,
  it,
  reload,
  signIn,
  submitSignInForm,
  WORKER_TEST_TIMEOUT,
} from "../../utils/browser";

function listBookmarksWithKey(apiKey: string) {
  return fetch(`http://localhost:${inject("karakeepPort")}/api/v1/bookmarks`, {
    headers: getAuthHeader(apiKey),
  });
}

it("changes the password and signs back in with the new one", async ({
  page,
}) => {
  const { email } = await createWebTestUser();
  await signIn(page, email);

  await goto(page, "/settings/info");
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#email")).toHaveValue(email);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Test User",
  );

  await page.getByLabel("Current password", { exact: true }).fill("test1234");
  await page.getByLabel("New password", { exact: true }).fill("n3w-passw0rd");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("n3w-passw0rd");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  // Confirmed inline next to the button, rather than with a toast.
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible({ timeout: 30000 });
  // The form is cleared after a successful change.
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveValue("");

  await goto(page, "/dashboard/bookmarks");
  // The profile menu trigger is the avatar, named after the user's initial.
  await page.getByRole("button", { name: "T", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/signin/, { timeout: 30000 });

  await submitSignInForm(page, email, "test1234");
  await expect(page.getByText("Incorrect email or password")).toBeVisible({
    timeout: 30000,
  });
  await expect(page).toHaveURL(/\/signin/);

  await signIn(page, email, "n3w-passw0rd");
});

it("rejects a password change with a wrong current password", async ({
  page,
}) => {
  const { email } = await createWebTestUser();
  await signIn(page, email);

  await goto(page, "/settings/info");
  await page.getByLabel("Current password", { exact: true }).fill("wrong-pass");
  await page.getByLabel("New password", { exact: true }).fill("n3w-passw0rd");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("n3w-passw0rd");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByText("Your current password is incorrect"),
  ).toBeVisible({ timeout: 30000 });

  // The old password keeps working.
  await goto(page, "/logout");
  await expect(page).toHaveURL(/\/signin/, { timeout: 30000 });
  await signIn(page, email);
});

it("hides archived bookmarks in tags once the archive option is changed", async ({
  page,
}) => {
  const { trpc, email } = await createWebTestUser();
  const tag = await trpc.tags.create.mutate({ name: "reading" });
  const active = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Still reading this one",
  });
  const archived = await trpc.bookmarks.createBookmark.mutate({
    type: BookmarkTypes.TEXT,
    text: "Already finished this one",
  });
  for (const bookmark of [active, archived]) {
    await trpc.bookmarks.updateTags.mutate({
      bookmarkId: bookmark.id,
      attach: [{ tagId: tag.id }],
      detach: [],
    });
  }
  await trpc.bookmarks.updateBookmark.mutate({
    bookmarkId: archived.id,
    archived: true,
  });
  await signIn(page, email);

  const cards = bookmarkCards(page);
  await goto(page, `/dashboard/tags/${tag.id}`);
  await expect(cards.filter({ hasText: "Already finished" })).toBeVisible();
  await expect(cards).toHaveCount(2);

  // The archive option lives on the General page, and saves on change.
  await goto(page, "/settings/preferences");
  const showOption = "Show in tags and lists";
  const hideOption = "Hide in tags and lists";
  await page.getByRole("combobox").filter({ hasText: showOption }).click();
  await page.getByRole("option", { name: hideOption, exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: hideOption }),
  ).toBeVisible();

  await reload(page);
  await expect(
    page.getByRole("combobox").filter({ hasText: hideOption }),
  ).toBeVisible();
  expect((await trpc.users.settings.query()).archiveDisplayBehaviour).toBe(
    "hide",
  );

  await goto(page, `/dashboard/tags/${tag.id}`);
  await expect(cards.filter({ hasText: "Still reading" })).toBeVisible();
  await expect(cards).toHaveCount(1);
});

it("creates an API key that works until it is deleted", async ({ page }) => {
  const { email } = await createWebTestUser();
  await signIn(page, email);

  await goto(page, "/settings/api-keys");
  await page.getByRole("button", { name: "New API key", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New API key" });
  await dialog.getByLabel("Name", { exact: true }).fill("My script");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  const successDialog = page.getByRole("dialog", {
    name: "Key was successfully created",
  });
  const keyInput = successDialog.getByRole("textbox");
  // The key is shown once its secret is hashed, which is slow while other
  // tests are hashing passwords.
  await expect(keyInput).not.toHaveValue("", { timeout: 30000 });
  const apiKey = await keyInput.inputValue();

  const okResponse = await listBookmarksWithKey(apiKey);
  expect(okResponse.status).toBe(200);

  await successDialog
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await expect(successDialog).not.toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "My script" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Full access");
  await reload(page);
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Delete API Key" });
  await expect(confirm).toContainText('"My script"');
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).not.toBeVisible();
  await expect(row).not.toBeVisible();
  // The key used by the test harness is untouched.
  await expect(
    page.getByRole("row").filter({ hasText: "test-key" }),
  ).toBeVisible();

  const revokedResponse = await listBookmarksWithKey(apiKey);
  expect(revokedResponse.status).toBe(401);
});

it("creates, edits and deletes a webhook", async ({ page }) => {
  const { trpc, email } = await createWebTestUser();
  await signIn(page, email);

  await goto(page, "/settings/webhooks");
  await expect(
    page.getByText("You don't have any webhooks configured yet."),
  ).toBeVisible();

  await page.getByRole("button", { name: "New webhook", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "New webhook" });
  await createDialog
    .getByLabel("URL", { exact: true })
    .fill("http://nginx/hooks/first");
  await createDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "created", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(createDialog.getByRole("combobox")).toHaveText("created");
  await createDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(createDialog).not.toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "http://nginx/hooks" });
  await expect(row).toContainText("http://nginx/hooks/first");
  await expect(row).toContainText("created");

  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit webhook" });
  await editDialog
    .getByLabel("URL", { exact: true })
    .fill("http://nginx/hooks/second");
  await editDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "edited", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(editDialog.getByRole("combobox")).toHaveText("created, edited");
  await editDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editDialog).not.toBeVisible();

  await expect(row).toContainText("http://nginx/hooks/second");
  await expect(row).toContainText("created, edited");
  await reload(page);
  await expect(row).toContainText("http://nginx/hooks/second");
  const { webhooks } = await trpc.webhooks.list.query();
  expect(webhooks).toHaveLength(1);
  expect(webhooks[0].url).toBe("http://nginx/hooks/second");
  expect(webhooks[0].events).toEqual(["created", "edited"]);

  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Delete webhook" });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).not.toBeVisible();
  await expect(
    page.getByText("You don't have any webhooks configured yet."),
  ).toBeVisible();
  expect((await trpc.webhooks.list.query()).webhooks).toHaveLength(0);
});

it(
  "creates a rule that tags new bookmarks, then disables and deletes it",
  { timeout: WORKER_TEST_TIMEOUT },
  async ({ page }) => {
    const { trpc, email } = await createWebTestUser();
    const tag = await trpc.tags.create.mutate({ name: "inbox" });
    await signIn(page, email);

    await goto(page, "/settings/rules");
    await expect(page.getByText("No rules created yet")).toBeVisible();
    await page.getByRole("button", { name: "New rule", exact: true }).click();

    await page.getByLabel("Rule name", { exact: true }).fill("Tag everything");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Adds the inbox tag to new bookmarks");
    // The new rule defaults to "A bookmark is added" -> "Add tag".
    await expect(
      page.getByRole("combobox").filter({ hasText: "A bookmark is added" }),
    ).toBeVisible();
    await page
      .getByRole("combobox")
      .filter({ hasText: "Select a tag..." })
      .click();
    await page.getByRole("option", { name: "inbox", exact: true }).click();
    await expect(
      page.getByRole("combobox").filter({ hasText: "inbox" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save rule", exact: true }).click();
    await expect(page.getByText("Rule created")).toBeVisible();

    // Saving closes the editor and lists the rule.
    await expect(
      page.getByRole("button", { name: "Save rule", exact: true }),
    ).not.toBeVisible();
    const ruleCard = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: "Tag everything" }) })
      .filter({ has: page.getByRole("switch") })
      .last();
    await expect(ruleCard).toContainText("Adds the inbox tag to new bookmarks");
    await expect(ruleCard).toContainText("Bookmark Added");
    await expect(ruleCard).toContainText("1 action");

    const [rule] = (await trpc.rules.list.query()).rules;
    expect(rule.enabled).toBe(true);
    expect(rule.event).toEqual({ type: "bookmarkAdded" });
    expect(rule.actions).toEqual([{ type: "addTag", tagId: tag.id }]);

    // The rule is evaluated by the workers.
    const bookmark = await trpc.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.TEXT,
      text: "A freshly added note",
    });
    await expect
      .poll(
        async () =>
          (
            await trpc.bookmarks.getBookmark.query({ bookmarkId: bookmark.id })
          ).tags.map((t) => t.name),
        { timeout: 90000 },
      )
      .toContain("inbox");

    await ruleCard.getByRole("switch").click();
    await expect(page.getByText("Rule updated")).toBeVisible();
    await expect(ruleCard.getByRole("switch")).not.toBeChecked();
    await reload(page);
    await expect(ruleCard.getByRole("switch")).not.toBeChecked();
    expect((await trpc.rules.list.query()).rules[0].enabled).toBe(false);

    await ruleCard.getByRole("button").last().click();
    const confirm = page.getByRole("dialog", { name: "Delete rule" });
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Rule deleted")).toBeVisible();
    await expect(page.getByText("No rules created yet")).toBeVisible();
    expect((await trpc.rules.list.query()).rules).toHaveLength(0);
  },
);
