import { ZBookmarkList } from "../types/lists";

export interface ZBookmarkListTreeNode {
  item: ZBookmarkList;
  children: ZBookmarkListTreeNode[];
}

export type ZBookmarkListRoot = Record<string, ZBookmarkListTreeNode>;

export function listsToTree(lists: ZBookmarkList[]) {
  const idToList = lists.reduce<Record<string, ZBookmarkList>>((acc, list) => {
    acc[list.id] = list;
    return acc;
  }, {});

  const root: ZBookmarkListRoot = {};

  // Prepare all refs
  const refIdx = lists.reduce<Record<string, ZBookmarkListTreeNode>>(
    (acc, l) => {
      acc[l.id] = {
        item: l,
        children: [],
      };
      return acc;
    },
    {},
  );

  // Build the tree
  lists.forEach((list) => {
    const node = refIdx[list.id];
    if (list.parentId) {
      refIdx[list.parentId].children.push(node);
    } else {
      root[list.id] = node;
    }
  });

  const allPaths: ZBookmarkList[][] = [];
  const dfs = (node: ZBookmarkListTreeNode, path: ZBookmarkList[]) => {
    const list = idToList[node.item.id];
    const newPath = [...path, list];
    allPaths.push(newPath);
    node.children.forEach((child) => {
      dfs(child, newPath);
    });
  };

  Object.values(root).forEach((node) => {
    dfs(node, []);
  });

  return {
    allPaths,
    root,
    getPathById: (id: string) =>
      allPaths.find((path) => path[path.length - 1].id === id),
  };
}
