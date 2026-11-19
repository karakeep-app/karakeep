import { describe, expect, it } from "vitest";

import type { RuleEngineCondition } from "../types/rules";
import { parseSearchQuery } from "../searchQueryParser";
import {
  getRuleConditionReferences,
  ruleConditionToSearchQuery,
} from "./ruleUtils";

const names = {
  tags: { tag1: "important", tag2: "read later" },
  feeds: { feed1: "Hacker News" },
};

function toQuery(condition: RuleEngineCondition) {
  return ruleConditionToSearchQuery(condition, names);
}

describe("ruleConditionToSearchQuery", () => {
  it("translates simple conditions", () => {
    expect(toQuery({ type: "urlContains", str: "example.com" })).toBe(
      'is:link url:"example.com"',
    );
    expect(toQuery({ type: "titleDoesNotContain", str: "draft" })).toBe(
      '-title:"draft"',
    );
    expect(toQuery({ type: "urlDoesNotContain", str: "youtube" })).toBe(
      'is:link -url:"youtube"',
    );
    expect(toQuery({ type: "hasTag", tagId: "tag2" })).toBe('#"read later"');
    expect(toQuery({ type: "importedFromFeed", feedId: "feed1" })).toBe(
      'feed:"Hacker News"',
    );
    expect(toQuery({ type: "bookmarkTypeIs", bookmarkType: "asset" })).toBe(
      "is:media",
    );
    expect(toQuery({ type: "bookmarkSourceIs", source: "rss" })).toBe(
      "source:rss",
    );
    expect(toQuery({ type: "isFavourited" })).toBe("is:fav");
    expect(toQuery({ type: "isArchived" })).toBe("is:archived");
    expect(toQuery({ type: "alwaysTrue" })).toBe("");
  });

  it("translates nested conditions into a query that parses back", () => {
    const query = toQuery({
      type: "and",
      conditions: [
        { type: "hasTag", tagId: "tag1" },
        {
          type: "or",
          conditions: [
            { type: "urlContains", str: "github.com" },
            { type: "isFavourited" },
          ],
        },
      ],
    });
    expect(query).toBe(
      '#"important" and ((is:link url:"github.com") or is:fav)',
    );
    expect(parseSearchQuery(query!)).toEqual({
      result: "full",
      text: "",
      matcher: {
        type: "and",
        matchers: [
          { type: "tagName", tagName: "important", inverse: false },
          {
            type: "or",
            matchers: [
              {
                type: "and",
                matchers: [
                  { type: "type", typeName: "link", inverse: false },
                  { type: "url", url: "github.com", inverse: false },
                ],
              },
              { type: "favourited", favourited: true },
            ],
          },
        ],
      },
    });
  });

  it("handles conditions that match everything", () => {
    expect(
      toQuery({
        type: "and",
        conditions: [{ type: "alwaysTrue" }, { type: "isArchived" }],
      }),
    ).toBe("is:archived");
    expect(
      toQuery({
        type: "or",
        conditions: [{ type: "alwaysTrue" }, { type: "isArchived" }],
      }),
    ).toBe("");
  });

  it("returns null for conditions that can't be expressed", () => {
    expect(toQuery({ type: "hasTag", tagId: "unknown" })).toBeNull();
    expect(toQuery({ type: "urlContains", str: "" })).toBeNull();
    expect(
      toQuery({
        type: "and",
        conditions: [
          { type: "isFavourited" },
          { type: "titleContains", str: 'say "hi"' },
        ],
      }),
    ).toBeNull();
    expect(toQuery({ type: "titleContains", str: 'it"s' })).toBe('title:it"s');
    // Unquoted values that the parser would read as something else
    expect(toQuery({ type: "titleContains", str: '#todo"mark"' })).toBeNull();
    expect(toQuery({ type: "titleContains", str: '!important"' })).toBeNull();
    expect(toQuery({ type: "titleContains", str: 'url:"x"' })).toBeNull();
    expect(toQuery({ type: "titleContains", str: '-a"' })).toBeNull();
    // Values that would read back as more than one matcher
    for (const str of [
      'x" is:fav',
      'x" or is:fav',
      'x" url:"github.com"',
      'x" #tag',
    ]) {
      expect(toQuery({ type: "titleContains", str })).toBeNull();
    }
    expect(toQuery({ type: "urlDoesNotContain", str: 'a"b' })).toBe(
      'is:link -url:a"b',
    );
    // An empty "or" matches nothing, an empty "and" everything
    expect(toQuery({ type: "or", conditions: [] })).toBeNull();
    expect(toQuery({ type: "and", conditions: [] })).toBe("");
  });
});

describe("getRuleConditionReferences", () => {
  it("collects nested tag and feed ids", () => {
    expect(
      getRuleConditionReferences({
        type: "or",
        conditions: [
          { type: "hasTag", tagId: "tag1" },
          {
            type: "and",
            conditions: [
              { type: "hasTag", tagId: "tag2" },
              { type: "importedFromFeed", feedId: "feed1" },
              { type: "hasTag", tagId: "tag1" },
            ],
          },
        ],
      }),
    ).toEqual({ tagIds: ["tag1", "tag2"], feedIds: ["feed1"] });
  });
});
