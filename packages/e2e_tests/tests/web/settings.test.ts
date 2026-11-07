import { expect } from "playwright/test";
import { inject } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { getAuthHeader } from "../../utils/api";
import {
  bookmarkCards,
  createWebTestUser,
  it,
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

  await page.goto("/settings/info");
  await expect(page.getByRole("heading", { name: "User Info" })).toBeVisible();
  await expect(page.locator("#email")).toHaveValue(email);
  await expect(page.locator("#name")).toHaveValue("Test User");

  await page.getByLabel("Current Password", { exact: true }).fill("test1234");
  await page.getByLabel("New Password", { exact: true }).fill("n3w-passw0rd");
  await page
    .getByLabel("Confirm New Password", { exact: true })
    .fill("n3w-passw0rd");
  await page
    .getByRole("button", { name: "Change Password", exact: true })
    .click();
  await expect(page.getByText("Password changed successfully")).toBeVisible({
    timeout: 30000,
  });
  // The form is cleared after a successful change.
  await expect(
    page.getByLabel("Current Password", { exact: true }),
  ).toHaveValue("");

  await page.goto("/dashboard/bookmarks");
  // The profile menu trigger is the avatar, named after the user's initial.
  await page.getByRole("button", { name: "T", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign Out", exact: true }).click();
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

  await page.goto("/settings/info");
  await page.getByLabel("Current Password", { exact: true }).fill("wrong-pass");
  await page.getByLabel("New Password", { exact: true }).fill("n3w-passw0rd");
  await page
    .getByLabel("Confirm New Password", { exact: true })
    .fill("n3w-passw0rd");
  await page
    .getByRole("button", { name: "Change Password", exact: true })
    .click();
  await expect(
    page.getByText("Your current password is incorrect"),
  ).toBeVisible({ timeout: 30000 });

  // The old password keeps working.
  await page.goto("/logout");
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
  await page.goto(`/dashboard/tags/${tag.id}`);
  await expect(cards.filter({ hasText: "Already finished" })).toBeVisible();
  await expect(cards).toHaveCount(2);

  await page.goto("/settings/info");
  const showOption = "Show archived bookmarks in tags and lists";
  const hideOption = "Hide archived bookmarks in tags and lists";
  await page.getByRole("combobox").filter({ hasText: showOption }).click();
  await page.getByRole("option", { name: hideOption, exact: true }).click();
  await expect(
    page.getByText("User settings have been updated!"),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: hideOption }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("combobox").filter({ hasText: hideOption }),
  ).toBeVisible();
  expect((await trpc.users.settings.query()).archiveDisplayBehaviour).toBe(
    "hide",
  );

  await page.goto(`/dashboard/tags/${tag.id}`);
  await expect(cards.filter({ hasText: "Still reading" })).toBeVisible();
  await expect(cards).toHaveCount(1);
});

it("creates an API key that works until it is deleted", async ({ page }) => {
  const { email } = await createWebTestUser();
  await signIn(page, email);

  await page.goto("/settings/api-keys");
  await page.getByRole("button", { name: "New API Key", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New API Key" });
  await dialog.getByLabel("Name", { exact: true }).fill("My script");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  const successDialog = page.getByRole("dialog", {
    name: "Key was successfully created",
  });
  const keyInput = successDialog.getByRole("textbox");
  await expect(keyInput).not.toHaveValue("");
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
  await page.reload();
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

  await page.goto("/settings/webhooks");
  await expect(
    page.getByText("You don't have any webhooks configured yet."),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Create Webhook", exact: true })
    .click();
  const createDialog = page.getByRole("dialog", { name: "Create Webhook" });
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
  const editDialog = page.getByRole("dialog", { name: "Edit Webhook" });
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
  await page.reload();
  await expect(row).toContainText("http://nginx/hooks/second");
  const { webhooks } = await trpc.webhooks.list.query();
  expect(webhooks).toHaveLength(1);
  expect(webhooks[0].url).toBe("http://nginx/hooks/second");
  expect(webhooks[0].events).toEqual(["created", "edited"]);

  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Webhook" });
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

    await page.goto("/settings/rules");
    await expect(page.getByText("No rules created yet")).toBeVisible();
    await page
      .getByRole("button", { name: "Create Rule", exact: true })
      .click();

    await page.getByLabel("Rule Name", { exact: true }).fill("Tag everything");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Adds the inbox tag to new bookmarks");
    // The new rule defaults to "A bookmark is added" -> "Add Tag".
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
    await page.getByRole("button", { name: "Save Rule", exact: true }).click();
    await expect(page.getByText("Rule has been created!")).toBeVisible();

    // Saving closes the editor and lists the rule.
    await expect(
      page.getByRole("button", { name: "Save Rule", exact: true }),
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
    await expect(page.getByText("Rule has been updated!")).toBeVisible();
    await expect(ruleCard.getByRole("switch")).not.toBeChecked();
    await page.reload();
    await expect(ruleCard.getByRole("switch")).not.toBeChecked();
    expect((await trpc.rules.list.query()).rules[0].enabled).toBe(false);

    await ruleCard.getByRole("button").last().click();
    const confirm = page.getByRole("dialog", { name: "Delete Rule" });
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Rule has been deleted!")).toBeVisible();
    await expect(page.getByText("No rules created yet")).toBeVisible();
    expect((await trpc.rules.list.query()).rules).toHaveLength(0);
  },
);
