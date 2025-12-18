import { RefinementCtx, z } from "zod";

// Events
const zBookmarkAddedEvent = z.object({
  type: z.literal("bookmarkAdded"),
});

const zTagAddedEvent = z.object({
  type: z.literal("tagAdded"),
  tagId: z.string(),
});

const zTagRemovedEvent = z.object({
  type: z.literal("tagRemoved"),
  tagId: z.string(),
});

const zAddedToListEvent = z.object({
  type: z.literal("addedToList"),
  listId: z.string(),
});

const zRemovedFromListEvent = z.object({
  type: z.literal("removedFromList"),
  listId: z.string(),
});

const zFavouritedEvent = z.object({
  type: z.literal("favourited"),
});

const zArchivedEvent = z.object({
  type: z.literal("archived"),
});

export const zRuleEngineEventSchema = z.discriminatedUnion("type", [
  zBookmarkAddedEvent,
  zTagAddedEvent,
  zTagRemovedEvent,
  zAddedToListEvent,
  zRemovedFromListEvent,
  zFavouritedEvent,
  zArchivedEvent,
]);
export type RuleEngineEvent = z.infer<typeof zRuleEngineEventSchema>;

// Conditions
const zAlwaysTrueCondition = z.object({
  type: z.literal("alwaysTrue"),
});

const zUrlContainsCondition = z.object({
  type: z.literal("urlContains"),
  str: z.string(),
});

const zUrlDoesNotContainCondition = z.object({
  type: z.literal("urlDoesNotContain"),
  str: z.string(),
});

const zImportedFromFeedCondition = z.object({
  type: z.literal("importedFromFeed"),
  feedId: z.string(),
});

const zBookmarkTypeIsCondition = z.object({
  type: z.literal("bookmarkTypeIs"),
  bookmarkType: z.enum(["link", "text", "asset"]),
});

const zHasTagCondition = z.object({
  type: z.literal("hasTag"),
  tagId: z.string(),
});

const zIsFavouritedCondition = z.object({
  type: z.literal("isFavourited"),
});

const zIsArchivedCondition = z.object({
  type: z.literal("isArchived"),
});

const nonRecursiveCondition = z.discriminatedUnion("type", [
  zAlwaysTrueCondition,
  zUrlContainsCondition,
  zUrlDoesNotContainCondition,
  zImportedFromFeedCondition,
  zBookmarkTypeIsCondition,
  zHasTagCondition,
  zIsFavouritedCondition,
  zIsArchivedCondition,
]);

type NonRecursiveCondition = z.infer<typeof nonRecursiveCondition>;
export type RuleEngineCondition =
  | NonRecursiveCondition
  | { type: "and"; conditions: RuleEngineCondition[] }
  | { type: "or"; conditions: RuleEngineCondition[] };

export const zRuleEngineConditionSchema: z.ZodType<RuleEngineCondition> =
  z.lazy(() =>
    z.discriminatedUnion("type", [
      zAlwaysTrueCondition,
      zUrlContainsCondition,
      zUrlDoesNotContainCondition,
      zImportedFromFeedCondition,
      zBookmarkTypeIsCondition,
      zHasTagCondition,
      zIsFavouritedCondition,
      zIsArchivedCondition,
      z.object({
        type: z.literal("and"),
        conditions: z.array(zRuleEngineConditionSchema),
      }),
      z.object({
        type: z.literal("or"),
        conditions: z.array(zRuleEngineConditionSchema),
      }),
    ]),
  );

// Actions
const zAddTagAction = z.object({
  type: z.literal("addTag"),
  tagId: z.string(),
});

const zRemoveTagAction = z.object({
  type: z.literal("removeTag"),
  tagId: z.string(),
});

const zAddToListAction = z.object({
  type: z.literal("addToList"),
  listId: z.string(),
});

const zRemoveFromListAction = z.object({
  type: z.literal("removeFromList"),
  listId: z.string(),
});

const zDownloadFullPageArchiveAction = z.object({
  type: z.literal("downloadFullPageArchive"),
});

const zFavouriteBookmarkAction = z.object({
  type: z.literal("favouriteBookmark"),
});

const zArchiveBookmarkAction = z.object({
  type: z.literal("archiveBookmark"),
});

export const zRuleEngineActionSchema = z.discriminatedUnion("type", [
  zAddTagAction,
  zRemoveTagAction,
  zAddToListAction,
  zRemoveFromListAction,
  zDownloadFullPageArchiveAction,
  zFavouriteBookmarkAction,
  zArchiveBookmarkAction,
]);
export type RuleEngineAction = z.infer<typeof zRuleEngineActionSchema>;

export const zRuleEngineRuleSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable(),
  enabled: z.boolean(),
  event: zRuleEngineEventSchema,
  condition: zRuleEngineConditionSchema,
  actions: z.array(zRuleEngineActionSchema),
});
export type RuleEngineRule = z.infer<typeof zRuleEngineRuleSchema>;

const ruleValidaitorFn = (
  r: Omit<RuleEngineRule, "id">,
  ctx: RefinementCtx,
) => {
  const validateEvent = (event: RuleEngineEvent) => {
    switch (event.type) {
      case "bookmarkAdded":
      case "favourited":
      case "archived":
        return true;
      case "tagAdded":
      case "tagRemoved":
        if (event.tagId.length == 0) {
          ctx.addIssue({
            code: "custom",
            message: "You must specify a tag for this event type",
            path: ["event", "tagId"],
          });
          return false;
        }
        return true;
      case "addedToList":
      case "removedFromList":
        if (event.listId.length == 0) {
          ctx.addIssue({
            code: "custom",
            message: "You must specify a list for this event type",
            path: ["event", "listId"],
          });
          return false;
        }
        return true;
      default: {
        const _exhaustiveCheck: never = event;
        return false;
      }
    }
  };

  const validateCondition = (
    condition: RuleEngineCondition,
    depth: number,
  ): boolean => {
    if (depth > 10) {
      ctx.addIssue({
        code: "custom",
        message:
          "Rule conditions are too complex. Maximum allowed depth is 10.",
      });
      return false;
    }
    switch (condition.type) {
      case "alwaysTrue":
      case "bookmarkTypeIs":
      case "isFavourited":
      case "isArchived":
        return true;
      case "urlContains":
      case "urlDoesNotContain":
        if (condition.str.length == 0) {
          ctx.addIssue({
            code: "custom",
            message: "You must specify a URL for this condition type",
            path: ["condition", "str"],
          });
          return false;
        }
        return true;
      case "hasTag":
        if (condition.tagId.length == 0) {
          ctx.addIssue({
            code: "custom",
            message: "You must specify a tag for this condition type",
            path: ["condition", "tagId"],
          });
          return false;
        }
        return true;
      case "importedFromFeed":
        if (condition.feedId.length == 0) {
          ctx.addIssue({
            code: "custom",
            message: "You must specify a feed for this condition type",
            path: ["condition", "feedId"],
          });
          return false;
        }
        return true;
      case "and":
      case "or":
        if (condition.conditions.length == 0) {
          ctx.addIssue({
            code: "custom",
            message:
              "You must specify at least one condition for this condition type",
            path: ["condition"],
          });
          return false;
        }
        return condition.conditions.every((c) =>
          validateCondition(c, depth + 1),
        );
      default: {
        const _exhaustiveCheck: never = condition;
        return false;
      }
    }
  };
  const validateAction = (action: RuleEngineAction): boolean => {
    switch (action.type) {
      case "addTag":
      case "removeTag":
        if (action.tagId.length == 0) {
          ctx.addIssue({
            code: "custom",
            message: "You must specify a tag for this action type",
            path: ["actions", "tagId"],
          });
          return false;
        }
        return true;
      case "addToList":
      case "removeFromList":
        if (action.listId.length == 0) {
          ctx.addIssue({
            code: "custom",
            message: "You must specify a list for this action type",
            path: ["actions", "listId"],
          });
          return false;
        }
        return true;
      case "downloadFullPageArchive":
      case "favouriteBookmark":
      case "archiveBookmark":
        return true;
      default: {
        const _exhaustiveCheck: never = action;
        return false;
      }
    }
  };
  validateEvent(r.event);
  validateCondition(r.condition, 0);
  if (r.actions.length == 0) {
    ctx.addIssue({
      code: "custom",
      message: "You must specify at least one action",
      path: ["actions"],
    });
    return false;
  }
  r.actions.every((a) => validateAction(a));
};

export const zNewRuleEngineRuleSchema = zRuleEngineRuleSchema
  .omit({
    id: true,
  })
  .superRefine(ruleValidaitorFn);

export const zUpdateRuleEngineRuleSchema =
  zRuleEngineRuleSchema.superRefine(ruleValidaitorFn);
