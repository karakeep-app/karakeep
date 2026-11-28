import { describe, expect, it } from "vitest";

import { ZBookmarkList } from "../types/lists";
import { listsToTree } from "./listUtils";

function makeList(
  id: string,
  parentId: string | null,
  userRole: ZBookmarkList["userRole"] = "owner",
): ZBookmarkList {
  return {
    id,
    name: id,
    icon: "📁",
    parentId,
    type: "manual",
    public: false,
    hasCollaborators: userRole !== "owner",
    userRole,
  };
}

const pathIds = (path: ZBookmarkList[] | undefined) => path?.map((l) => l.id);

describe("listsToTree", () => {
  it("nests lists under their parents", () => {
    const tree = listsToTree([
      makeList("child", "parent"),
      makeList("parent", null),
      makeList("grandchild", "child"),
    ]);

    expect(Object.keys(tree.root)).toEqual(["parent"]);
    expect(pathIds(tree.getPathById("grandchild"))).toEqual([
      "parent",
      "child",
      "grandchild",
    ]);
    expect(tree.allPaths).toHaveLength(3);
  });

  it("keeps a list whose parent is shared with the user under that parent", () => {
    const tree = listsToTree([
      makeList("shared-parent", null, "editor"),
      makeList("child", "shared-parent"),
    ]);

    expect(pathIds(tree.getPathById("child"))).toEqual([
      "shared-parent",
      "child",
    ]);
  });

  it("puts a list whose parent isn't visible at the top level", () => {
    // e.g. a parent owned by someone who stopped sharing it with the user
    const tree = listsToTree([
      makeList("child", "unshared-parent"),
      makeList("grandchild", "child"),
    ]);

    expect(Object.keys(tree.root)).toEqual(["child"]);
    expect(pathIds(tree.getPathById("child"))).toEqual(["child"]);
    expect(pathIds(tree.getPathById("grandchild"))).toEqual([
      "child",
      "grandchild",
    ]);
    expect(tree.getPathById("unshared-parent")).toBeUndefined();
  });
});
