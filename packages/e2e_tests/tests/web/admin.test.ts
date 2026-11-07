import type { Locator, Page } from "playwright/test";
import { randomUUID } from "node:crypto";
import { expect } from "playwright/test";
import { inject } from "vitest";

import { it, signIn, submitSignInForm } from "../../utils/browser";
import { getTrpcClient } from "../../utils/trpc";

const PASSWORD = "test1234";

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@example.com`;
}

// The seeded admin's key has full access, which includes the admin scopes.
// It's only used to create per-test users, never to sign in.
function seedAdminTrpc() {
  return getTrpcClient(inject("adminApiKey"));
}

async function createUser(role: "user" | "admin", name: string) {
  const email = uniqueEmail(`admin-e2e-${role}`);
  const user = await seedAdminTrpc().admin.createUser.mutate({
    name,
    email,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    role,
  });
  return { ...user, email };
}

// The users page server-renders its tables, so their buttons are visible
// before React hydrates and an early click is silently lost. Keep clicking
// until the dialog (or menu) the trigger controls shows up.
async function openWith(trigger: Locator, popup: Locator) {
  await expect(async () => {
    if (!(await popup.isVisible())) {
      await trigger.click();
    }
    await expect(popup).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20000 });
}

// The users table renders every user on the server, so rows are always
// looked up by the test's unique email.
function userRow(page: Page, email: string) {
  return page.getByRole("row").filter({ hasText: email });
}

// The row action buttons are icon-only and have no accessible name; their
// tooltips only show on hover. They are rendered as delete, reset password
// and edit, in that order.
function userRowAction(
  page: Page,
  email: string,
  action: "delete" | "resetPassword" | "edit",
) {
  const index = { delete: 0, resetPassword: 1, edit: 2 }[action];
  return userRow(page, email).getByRole("button").nth(index);
}

// The card header create buttons are icon-only too. The innermost div that
// contains the card title is the header, which holds just that one button.
function cardHeaderButton(page: Page, title: string | RegExp) {
  const main = page.getByRole("main");
  return main
    .locator("div")
    .filter({ has: page.getByText(title, { exact: true }) })
    .last()
    .getByRole("button");
}

it("shows the admin area only to admins", async ({ page }) => {
  // The profile menu trigger is named after the first letter of the name.
  const regular = await createUser("user", "Rory Regular");
  await signIn(page, regular.email);
  await openWith(
    page.getByRole("button", { name: "R", exact: true }),
    page.getByRole("menu"),
  );
  await expect(
    page.getByRole("menuitem", { name: "User Settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Admin Settings" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/dashboard\/bookmarks$/);
  await expect(page.getByText("Users List", { exact: true })).toHaveCount(0);

  await page.context().clearCookies();
  const admin = await createUser("admin", "Ada Admin");
  await signIn(page, admin.email);
  await openWith(
    page.getByRole("button", { name: "A", exact: true }),
    page.getByRole("menu"),
  );
  await page.getByRole("menuitem", { name: "Admin Settings" }).click();
  await expect(page).toHaveURL(/\/admin\/overview$/);
  await expect(
    page.getByRole("main").getByText("Server Stats", { exact: true }),
  ).toBeVisible();
});

it("creates a user from the users page and the user can sign in", async ({
  page,
}) => {
  const admin = await createUser("admin", "Ada Admin");
  await signIn(page, admin.email);
  await page.goto("/admin/users");
  await expect(userRow(page, admin.email)).toBeVisible();

  const email = uniqueEmail("admin-e2e-created");
  // The create button is the only button in the users card header.
  const dialog = page.getByRole("dialog", { name: "Add User" });
  await openWith(cardHeaderButton(page, "Users List"), dialog);
  await dialog.getByLabel("Name", { exact: true }).fill("Casey Created");
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await dialog.getByLabel("Confirm Password", { exact: true }).fill(PASSWORD);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  // The dialog closes once the password is hashed, which is slow while other
  // tests are hashing passwords too.
  await expect(dialog).not.toBeVisible({ timeout: 30000 });

  const row = userRow(page, email);
  await expect(row).toContainText("Casey Created");
  await expect(row).toContainText("User");
  await page.reload();
  await expect(row).toContainText("Casey Created");

  const created = await seedAdminTrpc().admin.getUser.query({ email });
  expect(created).toMatchObject({ name: "Casey Created", role: "user" });

  await page.context().clearCookies();
  await signIn(page, email);
});

// After an edit or delete, the users list refetches users.list but not
// admin.userStats. If any user signed up since the page loaded (other tests
// do this constantly), UserList reads stats of an unknown user and the page
// crashes into the error boundary. Until that's fixed, these tests check the
// result after a reload instead of the in-place list refresh.
it("updates a user's role and quotas", async ({ page }) => {
  const admin = await createUser("admin", "Ada Admin");
  const target = await createUser("user", "Una Updated");
  await signIn(page, admin.email);
  await page.goto("/admin/users");

  const dialog = page.getByRole("dialog", { name: "Edit User" });
  await openWith(userRowAction(page, target.email, "edit"), dialog);
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "Admin", exact: true }).click();
  await dialog.getByLabel("Bookmark Quota", { exact: true }).fill("25");
  await dialog
    .getByLabel("Storage Quota (bytes)", { exact: true })
    .fill("1048576");
  await dialog.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByText("User updated successfully")).toBeVisible();

  await page.reload();
  const row = userRow(page, target.email);
  await expect(row).toContainText("0 / 25");
  await expect(row).toContainText("0 Bytes / 1.00 MB");
  await expect(
    row.getByRole("cell", { name: "Admin", exact: true }),
  ).toBeVisible();
  expect(
    await seedAdminTrpc().admin.getUser.query({ id: target.id }),
  ).toMatchObject({ role: "admin", bookmarkQuota: 25, storageQuota: 1048576 });

  // The dialog is prefilled with the saved values, and clearing a quota
  // makes it unlimited again.
  await openWith(userRowAction(page, target.email, "edit"), dialog);
  const bookmarkQuota = dialog.getByLabel("Bookmark Quota", { exact: true });
  await expect(bookmarkQuota).toHaveValue("25");
  await expect(
    dialog.getByLabel("Storage Quota (bytes)", { exact: true }),
  ).toHaveValue("1048576");
  await expect(dialog.getByRole("combobox")).toHaveText("Admin");
  await bookmarkQuota.clear();
  await dialog.getByRole("button", { name: "Update", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.reload();
  await expect(row).toContainText("0 / Unlimited");
  expect(
    await seedAdminTrpc().admin.getUser.query({ id: target.id }),
  ).toMatchObject({
    role: "admin",
    bookmarkQuota: null,
    storageQuota: 1048576,
  });
});

it("resets a user's password so they sign in with the new one", async ({
  page,
}) => {
  const admin = await createUser("admin", "Ada Admin");
  const target = await createUser("user", "Pat Password");
  await signIn(page, admin.email);
  await page.goto("/admin/users");

  const newPassword = `new-${randomUUID()}`;
  const dialog = page.getByRole("dialog", { name: "Reset Password" });
  await openWith(userRowAction(page, target.email, "resetPassword"), dialog);
  await dialog.getByLabel("New Password", { exact: true }).fill(newPassword);
  await dialog
    .getByLabel("Confirm New Password", { exact: true })
    .fill(newPassword);
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  // See the create test: the dialog closes once the password is hashed.
  await expect(dialog).not.toBeVisible({ timeout: 30000 });

  await page.context().clearCookies();
  await submitSignInForm(page, target.email, PASSWORD);
  await expect(page.getByText("Incorrect email or password")).toBeVisible({
    timeout: 30000,
  });
  await expect(page).toHaveURL(/\/signin/);

  await signIn(page, target.email, newPassword);
});

// See the note above the update test for why this reloads first.
it("deletes a user from the users page", async ({ page }) => {
  const admin = await createUser("admin", "Ada Admin");
  const target = await createUser("user", "Dana Deleted");
  await signIn(page, admin.email);
  await page.goto("/admin/users");

  const dialog = page.getByRole("dialog", { name: "Delete User" });
  await openWith(userRowAction(page, target.email, "delete"), dialog);
  await expect(dialog).toContainText("Dana Deleted");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("User deleted", { exact: true })).toBeVisible();
  await page.reload();
  await expect(userRow(page, admin.email)).toBeVisible();
  await expect(userRow(page, target.email)).toHaveCount(0);

  await expect(
    seedAdminTrpc().admin.getUser.query({ id: target.id }),
  ).rejects.toThrow(/User not found/);
});

it("sends and revokes an invite", async ({ page }) => {
  const admin = await createUser("admin", "Ada Admin");
  await signIn(page, admin.email);
  await page.goto("/admin/users");

  const email = uniqueEmail("admin-e2e-invite");
  const dialog = page.getByRole("dialog", { name: "Send User Invitation" });
  await openWith(cardHeaderButton(page, /^User Invitations \(\d+\)$/), dialog);
  await dialog.getByLabel("Email Address", { exact: true }).fill(email);
  await dialog
    .getByRole("button", { name: "Send Invitation", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();

  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toContainText("Ada Admin");
  await page.reload();
  await expect(row).toContainText("Ada Admin");

  // Actions are resend, then revoke.
  const confirm = page.getByRole("dialog", { name: "Revoke Invite" });
  await openWith(row.getByRole("button").nth(1), confirm);
  await expect(confirm).toContainText(email);
  await confirm.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(confirm).not.toBeVisible();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/^User Invitations \(\d+\)$/)).toBeVisible();
  await expect(row).toHaveCount(0);
});

it("renders the overview and background jobs pages", async ({ page }) => {
  const admin = await createUser("admin", "Ada Admin");
  await signIn(page, admin.email);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/overview$/);

  const main = page.getByRole("main");
  await expect(main.getByText("Server Stats", { exact: true })).toBeVisible();
  await expect(main.getByText("Total Users", { exact: true })).toBeVisible();
  await expect(
    main.getByText("Total Bookmarks", { exact: true }),
  ).toBeVisible();
  await expect(main.getByText("Server Version", { exact: true })).toBeVisible();

  await expect(
    main.getByText("Service Connections", { exact: true }),
  ).toBeVisible();
  for (const service of ["Search Engine", "Browser", "Queue System"]) {
    const card = page
      .locator("div.rounded-lg")
      .filter({ has: page.getByText(service, { exact: true }) });
    await expect(card).toContainText("Connected");
  }

  await page
    .getByRole("link", { name: "Background Jobs", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/background_jobs$/);
  await expect(
    page.getByRole("heading", { name: "Background Jobs", exact: true }),
  ).toBeVisible();
  for (const job of [
    "Crawler Jobs",
    "Inference Jobs",
    "Indexing Jobs",
    "Webhook Jobs",
    "RSS Feed Jobs",
  ]) {
    await expect(
      page.getByRole("heading", { name: job, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Reindex All Bookmarks" }),
  ).toBeVisible();
});
