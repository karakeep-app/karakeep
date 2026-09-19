import type { Page } from "playwright/test";
import { chromium, expect } from "playwright/test";
import { inject, it as base } from "vitest";

import { createTestUser } from "./api";
import { getTrpcClient } from "./trpc";

export const it = base.extend<{ page: Page }>({
  // Vitest requires destructuring, even when no other fixtures are needed.
  // oxlint-disable-next-line no-empty-pattern
  page: async ({}, use) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        baseURL: `http://localhost:${inject("karakeepPort")}`,
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
      });
      page.setDefaultTimeout(10000);
      await use(page);
    } finally {
      await browser.close();
    }
  },
});

export async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test1234");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookmarks$/);
}

export async function createWebTestUser() {
  const trpc = getTrpcClient(await createTestUser());
  const { email } = await trpc.users.whoami.query();
  if (!email) {
    throw new Error("The test user must have an email address");
  }
  return { trpc, email };
}
