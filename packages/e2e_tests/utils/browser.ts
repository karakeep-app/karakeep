import type { Page } from "playwright/test";
import { chromium, expect } from "playwright/test";
import { inject, it as base } from "vitest";

import { createTestUser } from "./api";
import { waitUntil } from "./general";
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

// Fills and submits the sign in form without checking the outcome.
export async function submitSignInForm(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
}

export async function signIn(page: Page, email: string, password = "test1234") {
  await submitSignInForm(page, email, password);
  // Signing in verifies the password and then redirects through / to the
  // dashboard. While other test files are hashing passwords for their users,
  // this can take well over the default 5s expect timeout.
  await expect(page).toHaveURL(/\/dashboard\/bookmarks$/, { timeout: 30000 });
}

// The bookmark cards on screen. Hidden card elements can still be in the DOM,
// so only the visible ones are matched.
export function bookmarkCards(page: Page) {
  return page.locator("[data-bookmark-index]").filter({ visible: true });
}

// Tests that wait on the background workers (crawling, indexing, tagging)
// get a longer timeout: when the whole e2e suite runs, the worker tests fill
// the queues and a job can wait for a minute or more.
export const WORKER_TEST_TIMEOUT = 180000;

// Cards show a skeleton instead of their tags until the bookmark's tagging
// job has run (a no-op for test users, who have auto-tagging disabled). That
// job can sit in the queue for a while, so wait for it before asserting on
// the tags shown on a card. Tests calling this should use WORKER_TEST_TIMEOUT.
export async function waitForTaggingToFinish(
  trpc: ReturnType<typeof getTrpcClient>,
  bookmarkId: string,
) {
  await waitUntil(
    async () => {
      const { taggingStatus } = await trpc.bookmarks.getBookmark.query({
        bookmarkId,
      });
      return taggingStatus !== "pending";
    },
    "Tagging job is done",
    90000,
  );
}

export async function createWebTestUser() {
  const trpc = getTrpcClient(await createTestUser());
  const { email } = await trpc.users.whoami.query();
  if (!email) {
    throw new Error("The test user must have an email address");
  }
  return { trpc, email };
}
