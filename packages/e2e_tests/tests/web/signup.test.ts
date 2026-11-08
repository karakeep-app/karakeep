import { randomUUID } from "node:crypto";
import { expect } from "playwright/test";

import { bookmarkEditor, goto, it, signIn } from "../../utils/browser";

it("signs up and can sign back in with the new account", async ({ page }) => {
  const email = `signup-${randomUUID()}@example.com`;
  await goto(page, "/signin");
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Signup Test User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test1234");
  await page.getByLabel("Confirm password", { exact: true }).fill("test1234");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookmarks$/);
  await expect(bookmarkEditor(page)).toBeVisible();

  // Remove the automatic signup session to verify the saved credentials.
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(bookmarkEditor(page)).toBeVisible();
});
