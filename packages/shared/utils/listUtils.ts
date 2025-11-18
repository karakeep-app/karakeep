import { ZBookmarkList } from "../types/lists";

export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 100;

// Reserved slugs that cannot be used for custom list URLs
const RESERVED_SLUGS = new Set([
  "new",
  "edit",
  "delete",
  "settings",
  "admin",
  "api",
  "dashboard",
  "public",
  "private",
  "shared",
  "user",
  "users",
]);

/**
 * Validates a slug for use in public list URLs
 * - Must be 3-100 characters
 * - Only lowercase letters, numbers, and hyphens
 * - Cannot start or end with a hyphen
 * - Cannot have consecutive hyphens
 * - Cannot be a reserved word
 */
export function validateSlug(slug: string): {
  valid: boolean;
  error?: string;
} {
  // Check length
  if (slug.length < MIN_SLUG_LENGTH) {
    return {
      valid: false,
      error: `Slug must be at least ${MIN_SLUG_LENGTH} characters`,
    };
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    return {
      valid: false,
      error: `Slug must be at most ${MAX_SLUG_LENGTH} characters`,
    };
  }

  // Check format: lowercase alphanumeric with hyphens
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      valid: false,
      error: "Slug can only contain lowercase letters, numbers, and hyphens",
    };
  }

  // Check that it doesn't start or end with hyphen
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return {
      valid: false,
      error: "Slug cannot start or end with a hyphen",
    };
  }

  // Check for consecutive hyphens
  if (slug.includes("--")) {
    return {
      valid: false,
      error: "Slug cannot contain consecutive hyphens",
    };
  }

  // Check against reserved words
  if (RESERVED_SLUGS.has(slug)) {
    return {
      valid: false,
      error: "This slug is reserved and cannot be used",
    };
  }

  return { valid: true };
}

/**
 * Generates a URL-friendly slug from a list name
 * - Converts to lowercase
 * - Replaces spaces and special characters with hyphens
 * - Removes consecutive hyphens
 * - Trims hyphens from start and end
 */
export function generateSlugFromName(name: string): string {
  return (
    name
      .toLowerCase()
      // Replace spaces and special characters with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // Remove consecutive hyphens
      .replace(/-+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-|-$/g, "")
      // Truncate to max length
      .slice(0, MAX_SLUG_LENGTH)
  );
}

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
