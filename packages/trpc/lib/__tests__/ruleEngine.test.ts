import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import {
  bookmarkLinks,
  bookmarkLists,
  bookmarks,
  bookmarksInLists,
  bookmarkTags,
  rssFeedImportsTable,
  rssFeedsTable,
  ruleEngineActionsTable as ruleActions,
  ruleEngineRulesTable as rules,
  tagsOnBookmarks,
  users,
} from "@karakeep/db/schema";
import { LinkCrawlerQueue } from "@karakeep/shared-server";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  RuleEngineAction,
  RuleEngineCondition,
  RuleEngineEvent,
  RuleEngineRule,
} from "@karakeep/shared/types/rules";

import { AuthedContext } from "../..";
import { TestDB } from "../../testUtils";
import { RuleEngine } from "../ruleEngine";

// Mock the queue
vi.mock("@karakeep/shared-server", () => ({
  LinkCrawlerQueue: {
    enqueue: vi.fn(),
  },
  triggerRuleEngineOnEvent: vi.fn(),
}));

describe("RuleEngine", () => {
  let db: TestDB;
  let ctx: AuthedContext;
  let userId: string;
  let bookmarkId: string;
  let linkBookmarkId: string;
  let _textBookmarkId: string;
  let tagId1: string;
  let tagId2: string;
  let feedId1: string;
  let listId1: string;

  // Helper to seed a rule
  const seedRule = async (
    ruleData: Omit<RuleEngineRule, "id"> & { userId: string },
  ): Promise<string> => {
    const [insertedRule] = await db
      .insert(rules)
      .values({
        userId: ruleData.userId,
        name: ruleData.name,
        description: ruleData.description,
        enabled: ruleData.enabled,
        event: JSON.stringify(ruleData.event),
        condition: JSON.stringify(ruleData.condition),
      })
      .returning({ id: rules.id });

    await db.insert(ruleActions).values(
      ruleData.actions.map((action) => ({
        ruleId: insertedRule.id,
        action: JSON.stringify(action),
        userId: ruleData.userId,
      })),
    );
    return insertedRule.id;
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    db = getInMemoryDB(/* runMigrations */ true);

    // Seed User
    [userId] = (
      await db
        .insert(users)
        .values({ name: "Test User", email: "test@test.com" })
        .returning({ id: users.id })
    ).map((u) => u.id);

    ctx = {
      user: { id: userId, role: "user" },
      db: db, // Cast needed because TestDB might have extra test methods
      req: { ip: null },
    };

    // Seed Tags
    [tagId1, tagId2] = (
      await db
        .insert(bookmarkTags)
        .values([
          { name: "Tag1", userId },
          { name: "Tag2", userId },
        ])
        .returning({ id: bookmarkTags.id })
    ).map((t) => t.id);

    // Seed Feed
    [feedId1] = (
      await db
        .insert(rssFeedsTable)
        .values({ name: "Feed1", userId, url: "https://example.com/feed1" })
        .returning({ id: rssFeedsTable.id })
    ).map((f) => f.id);

    // Seed List
    [listId1] = (
      await db
        .insert(bookmarkLists)
        .values({ name: "List1", userId, type: "manual", icon: "📚" })
        .returning({ id: bookmarkLists.id })
    ).map((l) => l.id);

    // Seed Bookmarks
    [linkBookmarkId] = (
      await db
        .insert(bookmarks)
        .values({
          userId,
          type: BookmarkTypes.LINK,
          favourited: false,
          archived: false,
        })
        .returning({ id: bookmarks.id })
    ).map((b) => b.id);
    await db.insert(bookmarkLinks).values({
      id: linkBookmarkId,
      url: "https://example.com/test",
    });
    await db.insert(tagsOnBookmarks).values({
      bookmarkId: linkBookmarkId,
      tagId: tagId1,
      attachedBy: "human",
    });
    await db.insert(rssFeedImportsTable).values({
      bookmarkId: linkBookmarkId,
      rssFeedId: feedId1,
      entryId: "entry-id",
    });

    [_textBookmarkId] = (
      await db
        .insert(bookmarks)
        .values({
          userId,
          type: BookmarkTypes.TEXT,
          favourited: true,
          archived: false,
        })
        .returning({ id: bookmarks.id })
    ).map((b) => b.id);

    bookmarkId = linkBookmarkId; // Default bookmark for most tests
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("RuleEngine.forBookmark static method", () => {
    it("should initialize RuleEngine successfully for an existing bookmark", async () => {
      const engine = await RuleEngine.forBookmark(ctx, bookmarkId);
      expect(engine).toBeInstanceOf(RuleEngine);
    });

    it("should throw an error if bookmark is not found", async () => {
      await expect(
        RuleEngine.forBookmark(ctx, "nonexistent-bookmark"),
      ).rejects.toThrow("Bookmark nonexistent-bookmark not found");
    });

    it("should load rules associated with the bookmark's user", async () => {
      const ruleId = await seedRule({
        userId,
        name: "Test Rule",
        description: "",
        enabled: true,
        event: { type: "bookmarkAdded" },
        condition: { type: "urlContains", str: "example" },
        actions: [{ type: "addTag", tagId: tagId2 }],
      });

      const engine = await RuleEngine.forBookmark(ctx, bookmarkId);
      // @ts-expect-error Accessing private property for test verification
      expect(engine.rules).toHaveLength(1);
      // @ts-expect-error Accessing private property for test verification
      expect(engine.rules[0].id).toBe(ruleId);
    });
  });

  describe("doesBookmarkMatchConditions", () => {
    let engine: RuleEngine;

    beforeEach(async () => {
      engine = await RuleEngine.forBookmark(ctx, bookmarkId);
    });

    it("should return true for urlContains condition", () => {
      const condition: RuleEngineCondition = {
        type: "urlContains",
        str: "example.com",
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(true);
    });

    it("should return false for urlContains condition mismatch", () => {
      const condition: RuleEngineCondition = {
        type: "urlContains",
        str: "nonexistent",
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(false);
    });

    it("should return true for importedFromFeed condition", () => {
      const condition: RuleEngineCondition = {
        type: "importedFromFeed",
        feedId: feedId1,
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(true);
    });

    it("should return false for importedFromFeed condition mismatch", () => {
      const condition: RuleEngineCondition = {
        type: "importedFromFeed",
        feedId: "other-feed",
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(false);
    });

    it("should return true for bookmarkTypeIs condition (link)", () => {
      const condition: RuleEngineCondition = {
        type: "bookmarkTypeIs",
        bookmarkType: BookmarkTypes.LINK,
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(true);
    });

    it("should return false for bookmarkTypeIs condition mismatch", () => {
      const condition: RuleEngineCondition = {
        type: "bookmarkTypeIs",
        bookmarkType: BookmarkTypes.TEXT,
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(false);
    });

    it("should return true for hasTag condition", () => {
      const condition: RuleEngineCondition = { type: "hasTag", tagId: tagId1 };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(true);
    });

    it("should return false for hasTag condition mismatch", () => {
      const condition: RuleEngineCondition = { type: "hasTag", tagId: tagId2 };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(false);
    });

    it("should return false for isFavourited condition (default)", () => {
      const condition: RuleEngineCondition = { type: "isFavourited" };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(false);
    });

    it("should return true for isFavourited condition when favourited", async () => {
      await db
        .update(bookmarks)
        .set({ favourited: true })
        .where(eq(bookmarks.id, bookmarkId));
      const updatedEngine = await RuleEngine.forBookmark(ctx, bookmarkId);
      const condition: RuleEngineCondition = { type: "isFavourited" };
      expect(updatedEngine.doesBookmarkMatchConditions(condition)).toBe(true);
    });

    it("should return false for isArchived condition (default)", () => {
      const condition: RuleEngineCondition = { type: "isArchived" };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(false);
    });

    it("should return true for isArchived condition when archived", async () => {
      await db
        .update(bookmarks)
        .set({ archived: true })
        .where(eq(bookmarks.id, bookmarkId));
      const updatedEngine = await RuleEngine.forBookmark(ctx, bookmarkId);
      const condition: RuleEngineCondition = { type: "isArchived" };
      expect(updatedEngine.doesBookmarkMatchConditions(condition)).toBe(true);
    });

    it("should handle and condition (true)", () => {
      const condition: RuleEngineCondition = {
        type: "and",
        conditions: [
          { type: "urlContains", str: "example" },
          { type: "hasTag", tagId: tagId1 },
        ],
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(true);
    });

    it("should handle and condition (false)", () => {
      const condition: RuleEngineCondition = {
        type: "and",
        conditions: [
          { type: "urlContains", str: "example" },
          { type: "hasTag", tagId: tagId2 }, // This one is false
        ],
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(false);
    });

    it("should handle or condition (true)", () => {
      const condition: RuleEngineCondition = {
        type: "or",
        conditions: [
          { type: "urlContains", str: "nonexistent" }, // false
          { type: "hasTag", tagId: tagId1 }, // true
        ],
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(true);
    });

    it("should handle or condition (false)", () => {
      const condition: RuleEngineCondition = {
        type: "or",
        conditions: [
          { type: "urlContains", str: "nonexistent" }, // false
          { type: "hasTag", tagId: tagId2 }, // false
        ],
      };
      expect(engine.doesBookmarkMatchConditions(condition)).toBe(false);
    });
  });

  describe("evaluateRule", () => {
    let ruleId: string;
    let engine: RuleEngine;
    let testRule: RuleEngineRule;

    beforeEach(async () => {
      const tmp = {
        id: "", // Will be set after seeding
        userId,
        name: "Evaluate Rule Test",
        description: "",
        enabled: true,
        event: { type: "bookmarkAdded" },
        condition: { type: "urlContains", str: "example" },
        actions: [{ type: "addTag", tagId: tagId2 }],
      } as Omit<RuleEngineRule, "id"> & { userId: string };
      ruleId = await seedRule(tmp);
      testRule = { ...tmp, id: ruleId };
      engine = await RuleEngine.forBookmark(ctx, bookmarkId);
    });

    it("should evaluate rule successfully when event and conditions match", async () => {
      const event: RuleEngineEvent = { type: "bookmarkAdded" };
      const results = await engine.evaluateRule(testRule, event);
      expect(results).toEqual([
        { type: "success", ruleId: ruleId, message: `Added tag ${tagId2}` },
      ]);
      // Verify action was performed
      const tags = await db.query.tagsOnBookmarks.findMany({
        where: eq(tagsOnBookmarks.bookmarkId, bookmarkId),
      });
      expect(tags.map((t) => t.tagId)).toContain(tagId2);
    });

    it("should return empty array if rule is disabled", async () => {
      await db
        .update(rules)
        .set({ enabled: false })
        .where(eq(rules.id, ruleId));
      const disabledRule = { ...testRule, enabled: false };
      const event: RuleEngineEvent = { type: "bookmarkAdded" };
      const results = await engine.evaluateRule(disabledRule, event);
      expect(results).toEqual([]);
    });

    it("should return empty array if event does not match", async () => {
      const event: RuleEngineEvent = { type: "favourited" };
      const results = await engine.evaluateRule(testRule, event);
      expect(results).toEqual([]);
    });

    it("should return empty array if condition does not match", async () => {
      const nonMatchingRule: RuleEngineRule = {
        ...testRule,
        condition: { type: "urlContains", str: "nonexistent" },
      };
      await db
        .update(rules)
        .set({ condition: JSON.stringify(nonMatchingRule.condition) })
        .where(eq(rules.id, ruleId));

      const event: RuleEngineEvent = { type: "bookmarkAdded" };
      const results = await engine.evaluateRule(nonMatchingRule, event);
      expect(results).toEqual([]);
    });

    it("should return failure result if action fails", async () => {
      // Mock addBookmark to throw an error
      const listAddBookmarkSpy = vi
        .spyOn(RuleEngine.prototype, "executeAction")
        .mockImplementation(async (action: RuleEngineAction) => {
          if (action.type === "addToList") {
            throw new Error("Failed to add to list");
          }
          // Call original for other actions if needed, though not strictly necessary here
          return Promise.resolve(`Action ${action.type} executed`);
        });

      const ruleWithFailingAction = {
        ...testRule,
        actions: [{ type: "addToList", listId: "invalid-list" } as const],
      };
      await db.delete(ruleActions).where(eq(ruleActions.ruleId, ruleId)); // Clear old actions
      await db.insert(ruleActions).values({
        ruleId: ruleId,
        action: JSON.stringify(ruleWithFailingAction.actions[0]),
        userId,
      });

      const event: RuleEngineEvent = { type: "bookmarkAdded" };
      const results = await engine.evaluateRule(ruleWithFailingAction, event);

      expect(results).toEqual([
        {
          type: "failure",
          ruleId: ruleId,
          message: "Failed to add to list",
        },
      ]);
      listAddBookmarkSpy.mockRestore();
    });
  });

  describe("executeAction", () => {
    let engine: RuleEngine;

    beforeEach(async () => {
      engine = await RuleEngine.forBookmark(ctx, bookmarkId);
    });

    it("should execute addTag action", async () => {
      const action: RuleEngineAction = { type: "addTag", tagId: tagId2 };
      const result = await engine.executeAction(action);
      expect(result).toBe(`Added tag ${tagId2}`);
      const tagLink = await db.query.tagsOnBookmarks.findFirst({
        where: and(
          eq(tagsOnBookmarks.bookmarkId, bookmarkId),
          eq(tagsOnBookmarks.tagId, tagId2),
        ),
      });
      expect(tagLink).toBeDefined();
    });

    it("should execute removeTag action", async () => {
      // Ensure tag exists first
      expect(
        await db.query.tagsOnBookmarks.findFirst({
          where: and(
            eq(tagsOnBookmarks.bookmarkId, bookmarkId),
            eq(tagsOnBookmarks.tagId, tagId1),
          ),
        }),
      ).toBeDefined();

      const action: RuleEngineAction = { type: "removeTag", tagId: tagId1 };
      const result = await engine.executeAction(action);
      expect(result).toBe(`Removed tag ${tagId1}`);
      const tagLink = await db.query.tagsOnBookmarks.findFirst({
        where: and(
          eq(tagsOnBookmarks.bookmarkId, bookmarkId),
          eq(tagsOnBookmarks.tagId, tagId1),
        ),
      });
      expect(tagLink).toBeUndefined();
    });

    it("should execute addToList action", async () => {
      const action: RuleEngineAction = { type: "addToList", listId: listId1 };
      const result = await engine.executeAction(action);
      expect(result).toBe(`Added to list ${listId1}`);
      const listLink = await db.query.bookmarksInLists.findFirst({
        where: and(
          eq(bookmarksInLists.bookmarkId, bookmarkId),
          eq(bookmarksInLists.listId, listId1),
        ),
      });
      expect(listLink).toBeDefined();
    });

    it("should execute removeFromList action", async () => {
      // Add to list first
      await db
        .insert(bookmarksInLists)
        .values({ bookmarkId: bookmarkId, listId: listId1 });
      expect(
        await db.query.bookmarksInLists.findFirst({
          where: and(
            eq(bookmarksInLists.bookmarkId, bookmarkId),
            eq(bookmarksInLists.listId, listId1),
          ),
        }),
      ).toBeDefined();

      const action: RuleEngineAction = {
        type: "removeFromList",
        listId: listId1,
      };
      const result = await engine.executeAction(action);
      expect(result).toBe(`Removed from list ${listId1}`);
      const listLink = await db.query.bookmarksInLists.findFirst({
        where: and(
          eq(bookmarksInLists.bookmarkId, bookmarkId),
          eq(bookmarksInLists.listId, listId1),
        ),
      });
      expect(listLink).toBeUndefined();
    });

    it("should execute downloadFullPageArchive action", async () => {
      const action: RuleEngineAction = { type: "downloadFullPageArchive" };
      const result = await engine.executeAction(action);
      expect(result).toBe(`Enqueued full page archive`);
      expect(LinkCrawlerQueue.enqueue).toHaveBeenCalledWith({
        bookmarkId: bookmarkId,
        archiveFullPage: true,
        runInference: false,
      });
    });

    it("should execute favouriteBookmark action", async () => {
      let bm = await db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, bookmarkId),
      });
      expect(bm?.favourited).toBe(false);

      const action: RuleEngineAction = { type: "favouriteBookmark" };
      const result = await engine.executeAction(action);
      expect(result).toBe(`Marked as favourited`);

      bm = await db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, bookmarkId),
      });
      expect(bm?.favourited).toBe(true);
    });

    it("should execute archiveBookmark action", async () => {
      let bm = await db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, bookmarkId),
      });
      expect(bm?.archived).toBe(false);

      const action: RuleEngineAction = { type: "archiveBookmark" };
      const result = await engine.executeAction(action);
      expect(result).toBe(`Marked as archived`);

      bm = await db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, bookmarkId),
      });
      expect(bm?.archived).toBe(true);
    });
  });

  describe("onEvent", () => {
    let ruleMatchId: string;
    let _ruleNoMatchConditionId: string;
    let _ruleNoMatchEventId: string;
    let _ruleDisabledId: string;
    let engine: RuleEngine;

    beforeEach(async () => {
      // Rule that should match and execute
      ruleMatchId = await seedRule({
        userId,
        name: "Match Rule",
        description: "",
        enabled: true,
        event: { type: "bookmarkAdded" },
        condition: { type: "urlContains", str: "example" },
        actions: [{ type: "addTag", tagId: tagId2 }],
      });

      // Rule with non-matching condition
      _ruleNoMatchConditionId = await seedRule({
        userId,
        name: "No Match Condition Rule",
        description: "",
        enabled: true,
        event: { type: "bookmarkAdded" },
        condition: { type: "urlContains", str: "nonexistent" },
        actions: [{ type: "favouriteBookmark" }],
      });

      // Rule with non-matching event
      _ruleNoMatchEventId = await seedRule({
        userId,
        name: "No Match Event Rule",
        description: "",
        enabled: true,
        event: { type: "favourited" }, // Must match rule event type
        condition: { type: "urlContains", str: "example" },
        actions: [{ type: "archiveBookmark" }],
      });

      // Disabled rule
      _ruleDisabledId = await seedRule({
        userId,
        name: "Disabled Rule",
        description: "",
        enabled: false, // Disabled
        event: { type: "bookmarkAdded" },
        condition: { type: "urlContains", str: "example" },
        actions: [{ type: "addToList", listId: listId1 }],
      });

      engine = await RuleEngine.forBookmark(ctx, bookmarkId);
    });

    it("should process event and return only results for matching, enabled rules", async () => {
      const event: RuleEngineEvent = { type: "bookmarkAdded" };
      const results = await engine.onEvent(event);

      expect(results).toHaveLength(1); // Only ruleMatchId should produce a result
      expect(results[0]).toEqual({
        type: "success",
        ruleId: ruleMatchId,
        message: `Added tag ${tagId2}`,
      });

      // Verify only the action from the matching rule was executed
      const tags = await db.query.tagsOnBookmarks.findMany({
        where: eq(tagsOnBookmarks.bookmarkId, bookmarkId),
      });
      expect(tags.map((t) => t.tagId)).toContain(tagId2); // Tag added by ruleMatchId

      const bm = await db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, bookmarkId),
      });
      expect(bm?.favourited).toBe(false); // Action from ruleNoMatchConditionId not executed
      expect(bm?.archived).toBe(false); // Action from ruleNoMatchEventId not executed

      const listLink = await db.query.bookmarksInLists.findFirst({
        where: and(
          eq(bookmarksInLists.bookmarkId, bookmarkId),
          eq(bookmarksInLists.listId, listId1),
        ),
      });
      expect(listLink).toBeUndefined(); // Action from ruleDisabledId not executed
    });

    it("should return empty array if no rules match the event", async () => {
      const event: RuleEngineEvent = { type: "tagAdded", tagId: "some-tag" }; // Event that matches no rules
      const results = await engine.onEvent(event);
      expect(results).toEqual([]);
    });
  });
});
