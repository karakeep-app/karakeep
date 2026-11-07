import type { RuleEngineCondition } from "../types/rules";
import type { Matcher } from "../types/search";
import { parseSearchQuery } from "../searchQueryParser";

function withQualifier(
  prefix: string,
  value: string | undefined,
  toMatcher: (value: string) => Matcher,
): string | null {
  if (!value) {
    return null;
  }
  if (!value.includes('"')) {
    return `${prefix}"${value}"`;
  }
  // Quoted strings can't contain quotes, so this only works for values that
  // the parser reads back as exactly the matcher we meant.
  const query = `${prefix}${value}`;
  const parsed = parseSearchQuery(query);
  if (parsed.result !== "full" || parsed.text !== "" || !parsed.matcher) {
    return null;
  }
  const expected: Record<string, unknown> = toMatcher(value);
  const actual: Record<string, unknown> = parsed.matcher;
  const keys = Object.keys(expected);
  return keys.length === Object.keys(actual).length &&
    keys.every((k) => actual[k] === expected[k])
    ? query
    : null;
}

/**
 * Collects the ids of the tags and feeds referenced by a condition.
 */
export function getRuleConditionReferences(condition: RuleEngineCondition): {
  tagIds: string[];
  feedIds: string[];
} {
  const tagIds = new Set<string>();
  const feedIds = new Set<string>();
  const visit = (c: RuleEngineCondition) => {
    switch (c.type) {
      case "hasTag":
        tagIds.add(c.tagId);
        break;
      case "importedFromFeed":
        feedIds.add(c.feedId);
        break;
      case "and":
      case "or":
        c.conditions.forEach(visit);
        break;
    }
  };
  visit(condition);
  return { tagIds: [...tagIds], feedIds: [...feedIds] };
}

/**
 * Translates a rule condition into a search query that matches the same
 * bookmarks. Returns an empty string for conditions that match everything,
 * and null when the condition can't be expressed in the query language.
 */
export function ruleConditionToSearchQuery(
  condition: RuleEngineCondition,
  names: {
    tags: Record<string, string>;
    feeds: Record<string, string>;
  },
): string | null {
  switch (condition.type) {
    case "alwaysTrue":
      return "";
    // The url rules only match links, while url: also matches assets
    case "urlContains": {
      const q = withQualifier("url:", condition.str, (url) => ({
        type: "url",
        url,
        inverse: false,
      }));
      return q === null ? null : `is:link ${q}`;
    }
    case "urlDoesNotContain": {
      const q = withQualifier("-url:", condition.str, (url) => ({
        type: "url",
        url,
        inverse: true,
      }));
      return q === null ? null : `is:link ${q}`;
    }
    case "titleContains":
      return withQualifier("title:", condition.str, (title) => ({
        type: "title",
        title,
        inverse: false,
      }));
    case "titleDoesNotContain":
      return withQualifier("-title:", condition.str, (title) => ({
        type: "title",
        title,
        inverse: true,
      }));
    case "importedFromFeed":
      return withQualifier(
        "feed:",
        names.feeds[condition.feedId],
        (feedName) => ({
          type: "rssFeedName",
          feedName,
          inverse: false,
        }),
      );
    case "bookmarkTypeIs":
      return {
        link: "is:link",
        text: "is:text",
        asset: "is:media",
      }[condition.bookmarkType];
    case "bookmarkSourceIs":
      return `source:${condition.source}`;
    case "hasTag":
      return withQualifier("#", names.tags[condition.tagId], (tagName) => ({
        type: "tagName",
        tagName,
        inverse: false,
      }));
    case "isFavourited":
      return "is:fav";
    case "isArchived":
      return "is:archived";
    case "and":
    case "or": {
      if (condition.type === "or" && condition.conditions.length === 0) {
        // An empty "or" matches nothing
        return null;
      }
      const parts: string[] = [];
      for (const c of condition.conditions) {
        const q = ruleConditionToSearchQuery(c, names);
        if (q === null) {
          return null;
        }
        if (q === "") {
          // Matching everything makes an "or" match everything, and is a
          // no-op in an "and".
          if (condition.type === "or") {
            return "";
          }
          continue;
        }
        parts.push(q);
      }
      if (parts.length <= 1) {
        return parts[0] ?? "";
      }
      return parts
        .map((p) => (p.includes(" ") ? `(${p})` : p))
        .join(` ${condition.type} `);
    }
    default: {
      const _exhaustiveCheck: never = condition;
      return null;
    }
  }
}
