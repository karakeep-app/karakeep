import { describe, expect, it } from "vitest";

import { ZBookmarkList } from "../types/lists";
import { listsToTree } from "./listUtils";

function list(
  id: string,
  name: string,
  parentId: string | null = null,
): ZBookmarkList {
  return {
    id,
    name,
    description: null,
    icon: "🚀",
    parentId,
    type: "manual",
    query: null,
    public: false,
    hasCollaborators: false,
    userRole: "owner",
  };
}

const names = (paths: ZBookmarkList[][]) =>
  paths.map((path) => path.map((l) => l.name).join("/"));

describe("listsToTree", () => {
  it("sorts the root lists by name", () => {
    const { root } = listsToTree([
      list("lc", "Cooking"),
      list("la", "Articles"),
      list("lb", "Books"),
    ]);

    expect(Object.values(root).map((node) => node.item.name)).toEqual([
      "Articles",
      "Books",
      "Cooking",
    ]);
  });

  it("sorts the children of a list by name", () => {
    const { root } = listsToTree([
      list("lr", "Reading"),
      list("lz", "Zines", "lr"),
      list("lb", "Blogs", "lr"),
      list("lp", "Papers", "lr"),
    ]);

    expect(root.lr.children.map((node) => node.item.name)).toEqual([
      "Blogs",
      "Papers",
      "Zines",
    ]);
  });

  it("returns allPaths in the order of the sorted tree", () => {
    const { allPaths } = listsToTree([
      list("lc", "Cooking"),
      list("la", "Articles"),
      list("lr", "Recipes", "lc"),
      list("ld", "Desserts", "lc"),
      list("lb", "Blogs", "la"),
    ]);

    expect(names(allPaths)).toEqual([
      "Articles",
      "Articles/Blogs",
      "Cooking",
      "Cooking/Desserts",
      "Cooking/Recipes",
    ]);
  });

  it("returns the same order no matter how the input is ordered", () => {
    const lists = [
      list("la", "Articles"),
      list("lc", "Cooking"),
      list("lb", "Blogs", "la"),
      list("lr", "Recipes", "lc"),
    ];

    const { allPaths } = listsToTree(lists);
    const { allPaths: reversedAllPaths } = listsToTree([...lists].reverse());

    expect(names(reversedAllPaths)).toEqual(names(allPaths));
  });

  it("doesn't reorder the passed in lists", () => {
    const lists = [list("lc", "Cooking"), list("la", "Articles")];
    listsToTree(lists);

    expect(lists.map((l) => l.name)).toEqual(["Cooking", "Articles"]);
  });

  it("resolves paths by id", () => {
    const { getPathById } = listsToTree([
      list("lc", "Cooking"),
      list("lr", "Recipes", "lc"),
      list("ld", "Desserts", "lr"),
    ]);

    expect(getPathById("ld")?.map((l) => l.name)).toEqual([
      "Cooking",
      "Recipes",
      "Desserts",
    ]);
    expect(getPathById("unknown")).toBeUndefined();
  });
});
