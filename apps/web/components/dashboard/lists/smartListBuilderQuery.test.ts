import { describe, expect, it } from "vitest";

import { isQueryRepresentableInBuilder } from "./smartListBuilderQuery";

describe("isQueryRepresentableInBuilder", () => {
  it.each([
    "",
    "is:fav",
    "-is:archived",
    "is:fav -is:archived tag:docs",
    '-tag:"two words" tag:docs age:<30d',
    "age:<2w",
    'list:"Reading Queue" -list:Archive',
    'url:example.com title:"release notes"',
  ])("accepts %s", (query) => {
    expect(isQueryRepresentableInBuilder(query)).toBe(true);
  });

  it.each([
    "free text",
    "has:notes",
    "-url:example.com",
    "title:a title:b",
    "list:",
    "is:fav or is:archived",
    "(is:fav)",
    "is:fav -is:fav",
    "age:<7d age:>1y",
    "-age:<7d",
    "tag:",
  ])("rejects %s", (query) => {
    expect(isQueryRepresentableInBuilder(query)).toBe(false);
  });
});
