import { eq } from "drizzle-orm";
import { assert, beforeEach, describe, expect, test } from "vitest";

import { bookmarkLinks, users } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { buildTestContext, getApiCaller } from "../testUtils";

beforeEach<CustomTestContext>(async (context) => {
  const testContext = await buildTestContext(true);
  Object.assign(context, testContext);
});

describe("Admin Routes", () => {
  describe("getBookmarkDebugInfo", () => {
    test<CustomTestContext>("admin can access bookmark debug info for link bookmark", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a bookmark as a regular user
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Update the bookmark link with some metadata
      await db
        .update(bookmarkLinks)
        .set({
          crawlStatus: "success",
          crawlStatusCode: 200,
          crawledAt: new Date(),
          htmlContent: "<html><body>Test content</body></html>",
          title: "Test Title",
          description: "Test Description",
        })
        .where(eq(bookmarkLinks.id, bookmark.id));

      // Admin should be able to access debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      expect(debugInfo.id).toEqual(bookmark.id);
      expect(debugInfo.type).toEqual(BookmarkTypes.LINK);
      expect(debugInfo.linkInfo).toBeDefined();
      assert(debugInfo.linkInfo);
      expect(debugInfo.linkInfo.url).toEqual("https://example.com");
      expect(debugInfo.linkInfo.crawlStatus).toEqual("success");
      expect(debugInfo.linkInfo.crawlStatusCode).toEqual(200);
      expect(debugInfo.linkInfo.hasHtmlContent).toEqual(true);
      expect(debugInfo.linkInfo.htmlContentPreview).toBeDefined();
      expect(debugInfo.linkInfo.htmlContentPreview).toContain("Test content");
    });

    test<CustomTestContext>("admin can access bookmark debug info for text bookmark", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a text bookmark
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        text: "This is a test text bookmark",
        type: BookmarkTypes.TEXT,
      });

      // Admin should be able to access debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      expect(debugInfo.id).toEqual(bookmark.id);
      expect(debugInfo.type).toEqual(BookmarkTypes.TEXT);
      expect(debugInfo.textInfo).toBeDefined();
      assert(debugInfo.textInfo);
      expect(debugInfo.textInfo.hasText).toEqual(true);
    });

    test<CustomTestContext>("admin can see bookmark tags in debug info", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a bookmark with tags
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Add tags to the bookmark
      await apiCallers[0].bookmarks.updateTags({
        bookmarkId: bookmark.id,
        attach: [{ tagName: "test-tag-1" }, { tagName: "test-tag-2" }],
        detach: [],
      });

      // Admin should be able to see tags in debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      expect(debugInfo.tags).toHaveLength(2);
      expect(debugInfo.tags.map((t) => t.name).sort()).toEqual([
        "test-tag-1",
        "test-tag-2",
      ]);
      expect(debugInfo.tags[0].attachedBy).toEqual("human");
    });

    test<CustomTestContext>("non-admin user cannot access bookmark debug info", async ({
      apiCallers,
    }) => {
      // Create a bookmark
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Non-admin user should not be able to access debug info
      // The admin procedure itself will throw FORBIDDEN
      await expect(() =>
        apiCallers[0].admin.getBookmarkDebugInfo({ bookmarkId: bookmark.id }),
      ).rejects.toThrow(/FORBIDDEN/);
    });

    test<CustomTestContext>("debug info includes asset URLs with signed tokens", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a bookmark
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Get debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      // Check that assets array is present
      expect(debugInfo.assets).toBeDefined();
      expect(Array.isArray(debugInfo.assets)).toBe(true);

      // If there are assets, check that they have signed URLs
      if (debugInfo.assets.length > 0) {
        const asset = debugInfo.assets[0];
        expect(asset.url).toBeDefined();
        expect(asset.url).toContain("/api/public/assets/");
        expect(asset.url).toContain("token=");
      }
    });

    test<CustomTestContext>("debug info truncates HTML content preview", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a bookmark
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Create a large HTML content
      const largeContent = "<html><body>" + "x".repeat(2000) + "</body></html>";
      await db
        .update(bookmarkLinks)
        .set({
          htmlContent: largeContent,
        })
        .where(eq(bookmarkLinks.id, bookmark.id));

      // Get debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      // Check that HTML preview is truncated to 1000 characters
      assert(debugInfo.linkInfo);
      expect(debugInfo.linkInfo.htmlContentPreview).toBeDefined();
      expect(debugInfo.linkInfo.htmlContentPreview!.length).toBeLessThanOrEqual(
        1000,
      );
    });
  });
});
