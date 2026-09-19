import { randomUUID } from "node:crypto";
import { expect } from "playwright/test";

import { it, signIn } from "../../utils/browser";

it("signs up and can sign back in with the new account", async ({ page }) => {
  const email = `signup-${randomUUID()}@example.com`;
  await page.goto("/signin");
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Full Name", { exact: true }).fill("Signup Test User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test1234");
  await page.getByLabel("Confirm Password", { exact: true }).fill("test1234");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookmarks$/);
  await expect(
    page.getByPlaceholder("Paste a link, write a note or drop an image…"),
  ).toBeVisible();

  // Remove the automatic signup session to verify the saved credentials.
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(
    page.getByPlaceholder("Paste a link, write a note or drop an image…"),
  ).toBeVisible();
});
