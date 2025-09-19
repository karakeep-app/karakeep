import { z } from "zod";

import { BookmarkTypes } from "./bookmarks";

const zTagNameMatcher = z.object({
  type: z.literal("tagName"),
  tagName: z.string(),
  inverse: z.boolean(),
});

const zListNameMatcher = z.object({
  type: z.literal("listName"),
  listName: z.string(),
  inverse: z.boolean(),
});

const zRssFeedNameMatcher = z.object({
  type: z.literal("rssFeedName"),
  feedName: z.string(),
  inverse: z.boolean(),
});

const zArchivedMatcher = z.object({
  type: z.literal("archived"),
  archived: z.boolean(),
});

const zUrlMatcher = z.object({
  type: z.literal("url"),
  url: z.string(),
  inverse: z.boolean(),
});

const zTitleMatcher = z.object({
  type: z.literal("title"),
  title: z.string(),
  inverse: z.boolean(),
});

const zFavouritedMatcher = z.object({
  type: z.literal("favourited"),
  favourited: z.boolean(),
});

const zDateAfterMatcher = z.object({
  type: z.literal("dateAfter"),
  dateAfter: z.date(),
  inverse: z.boolean(),
});

const zDateBeforeMatcher = z.object({
  type: z.literal("dateBefore"),
  dateBefore: z.date(),
  inverse: z.boolean(),
});

const zAgeMatcher = z.object({
  type: z.literal("age"),
  relativeDate: z.object({
    direction: z.enum(["newer", "older"]),
    amount: z.number(),
    unit: z.enum(["day", "week", "month", "year"]),
  }),
});

const zIsTaggedMatcher = z.object({
  type: z.literal("tagged"),
  tagged: z.boolean(),
});

const zIsInListMatcher = z.object({
  type: z.literal("inlist"),
  inList: z.boolean(),
});

const zTypeMatcher = z.object({
  type: z.literal("type"),
  typeName: z.enum([
    BookmarkTypes.LINK,
    BookmarkTypes.TEXT,
    BookmarkTypes.ASSET,
  ]),
  inverse: z.boolean(),
});

const zNonRecursiveMatcher = z.union([
  zTagNameMatcher,
  zListNameMatcher,
  zArchivedMatcher,
  zUrlMatcher,
  zTitleMatcher,
  zFavouritedMatcher,
  zDateAfterMatcher,
  zDateBeforeMatcher,
  zAgeMatcher,
  zIsTaggedMatcher,
  zIsInListMatcher,
  zTypeMatcher,
  zRssFeedNameMatcher,
]);

type NonRecursiveMatcher = z.infer<typeof zNonRecursiveMatcher>;
export type Matcher =
  | NonRecursiveMatcher
  | { type: "and"; matchers: Matcher[] }
  | { type: "or"; matchers: Matcher[] };

export const zMatcherSchema: z.ZodType<Matcher> = z.lazy(() => {
  return z.discriminatedUnion("type", [
    zTagNameMatcher,
    zListNameMatcher,
    zArchivedMatcher,
    zUrlMatcher,
    zTitleMatcher,
    zFavouritedMatcher,
    zDateAfterMatcher,
    zDateBeforeMatcher,
    zAgeMatcher,
    zIsTaggedMatcher,
    zIsInListMatcher,
    zTypeMatcher,
    zRssFeedNameMatcher,
    z.object({
      type: z.literal("and"),
      matchers: z.array(zMatcherSchema),
    }),
    z.object({
      type: z.literal("or"),
      matchers: z.array(zMatcherSchema),
    }),
  ]);
});
