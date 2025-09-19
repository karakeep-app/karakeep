import deepEql from "deep-equal";
import { and, eq } from "drizzle-orm";

import { bookmarks, tagsOnBookmarks } from "@karakeep/db/schema";
import { LinkCrawlerQueue } from "@karakeep/shared-server";
import {
  RuleEngineAction,
  RuleEngineCondition,
  RuleEngineEvent,
  RuleEngineRule,
} from "@karakeep/shared/types/rules";

import { AuthedContext } from "..";
import { List } from "../models/lists";
import { RuleEngineRuleModel } from "../models/rules";

async function fetchBookmark(db: AuthedContext["db"], bookmarkId: string) {
  return await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      link: {
        columns: {
          url: true,
        },
      },
      text: true,
      asset: true,
      tagsOnBookmarks: true,
      rssFeeds: {
        columns: {
          rssFeedId: true,
        },
      },
      user: {
        columns: {},
        with: {
          rules: {
            with: {
              actions: true,
            },
          },
        },
      },
    },
  });
}

type ReturnedBookmark = NonNullable<Awaited<ReturnType<typeof fetchBookmark>>>;

export interface RuleEngineEvaluationResult {
  type: "success" | "failure";
  ruleId: string;
  message: string;
}

export class RuleEngine {
  private constructor(
    private ctx: AuthedContext,
    private bookmark: Omit<ReturnedBookmark, "user">,
    private rules: RuleEngineRule[],
  ) {}

  static async forBookmark(ctx: AuthedContext, bookmarkId: string) {
    const [bookmark, rules] = await Promise.all([
      fetchBookmark(ctx.db, bookmarkId),
      RuleEngineRuleModel.getAll(ctx),
    ]);
    if (!bookmark) {
      throw new Error(`Bookmark ${bookmarkId} not found`);
    }
    return new RuleEngine(
      ctx,
      bookmark,
      rules.map((r) => r.rule),
    );
  }

  doesBookmarkMatchConditions(condition: RuleEngineCondition): boolean {
    switch (condition.type) {
      case "alwaysTrue": {
        return true;
      }
      case "urlContains": {
        return (this.bookmark.link?.url ?? "").includes(condition.str);
      }
      case "importedFromFeed": {
        return this.bookmark.rssFeeds.some(
          (f) => f.rssFeedId === condition.feedId,
        );
      }
      case "bookmarkTypeIs": {
        return this.bookmark.type === condition.bookmarkType;
      }
      case "hasTag": {
        return this.bookmark.tagsOnBookmarks.some(
          (t) => t.tagId === condition.tagId,
        );
      }
      case "isFavourited": {
        return this.bookmark.favourited;
      }
      case "isArchived": {
        return this.bookmark.archived;
      }
      case "and": {
        return condition.conditions.every((c) =>
          this.doesBookmarkMatchConditions(c),
        );
      }
      case "or": {
        return condition.conditions.some((c) =>
          this.doesBookmarkMatchConditions(c),
        );
      }
      default: {
        const _exhaustiveCheck: never = condition;
        return false;
      }
    }
  }

  async evaluateRule(
    rule: RuleEngineRule,
    event: RuleEngineEvent,
  ): Promise<RuleEngineEvaluationResult[]> {
    if (!rule.enabled) {
      return [];
    }
    if (!deepEql(rule.event, event, { strict: true })) {
      return [];
    }
    if (!this.doesBookmarkMatchConditions(rule.condition)) {
      return [];
    }
    const results = await Promise.allSettled(
      rule.actions.map((action) => this.executeAction(action)),
    );
    return results.map((result) => {
      if (result.status === "fulfilled") {
        return {
          type: "success",
          ruleId: rule.id,
          message: result.value,
        };
      } else {
        return {
          type: "failure",
          ruleId: rule.id,
          message: (result.reason as Error).message,
        };
      }
    });
  }

  async executeAction(action: RuleEngineAction): Promise<string> {
    switch (action.type) {
      case "addTag": {
        await this.ctx.db
          .insert(tagsOnBookmarks)
          .values([
            {
              attachedBy: "human",
              bookmarkId: this.bookmark.id,
              tagId: action.tagId,
            },
          ])
          .onConflictDoNothing();
        return `Added tag ${action.tagId}`;
      }
      case "removeTag": {
        await this.ctx.db
          .delete(tagsOnBookmarks)
          .where(
            and(
              eq(tagsOnBookmarks.tagId, action.tagId),
              eq(tagsOnBookmarks.bookmarkId, this.bookmark.id),
            ),
          );
        return `Removed tag ${action.tagId}`;
      }
      case "addToList": {
        const list = await List.fromId(this.ctx, action.listId);
        await list.addBookmark(this.bookmark.id);
        return `Added to list ${action.listId}`;
      }
      case "removeFromList": {
        const list = await List.fromId(this.ctx, action.listId);
        await list.removeBookmark(this.bookmark.id);
        return `Removed from list ${action.listId}`;
      }
      case "downloadFullPageArchive": {
        await LinkCrawlerQueue.enqueue({
          bookmarkId: this.bookmark.id,
          archiveFullPage: true,
          runInference: false,
        });
        return `Enqueued full page archive`;
      }
      case "favouriteBookmark": {
        await this.ctx.db
          .update(bookmarks)
          .set({
            favourited: true,
          })
          .where(eq(bookmarks.id, this.bookmark.id));
        return `Marked as favourited`;
      }
      case "archiveBookmark": {
        await this.ctx.db
          .update(bookmarks)
          .set({
            archived: true,
          })
          .where(eq(bookmarks.id, this.bookmark.id));
        return `Marked as archived`;
      }
      default: {
        const _exhaustiveCheck: never = action;
        return "";
      }
    }
  }

  async onEvent(event: RuleEngineEvent): Promise<RuleEngineEvaluationResult[]> {
    const results = await Promise.all(
      this.rules.map((rule) => this.evaluateRule(rule, event)),
    );

    return results.flat();
  }
}
