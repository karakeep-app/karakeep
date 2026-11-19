import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmarkList } from "@karakeep/shared/types/lists";
import { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";

type RenderFunc = (params: {
  node: ZBookmarkListTreeNode;
  level: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numBookmarks?: number;
}) => React.ReactNode;

type IsOpenFunc = (list: ZBookmarkListTreeNode) => boolean;

const OPEN_LISTS_STORAGE_KEY = "karakeep-open-lists";

function readOpenListIdsFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(OPEN_LISTS_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeOpenListIdsToStorage(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OPEN_LISTS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // storage full or unavailable -> fall back to session-only behavior.
  }
}

function collectSubtreeIds(node: ZBookmarkListTreeNode): string[] {
  return node.children.flatMap((l) => [l.item.id, ...collectSubtreeIds(l)]);
}

function hasStoredOpenDescendant(
  node: ZBookmarkListTreeNode,
  ids: Set<string>,
): boolean {
  return node.children.some(
    (l) => ids.has(l.item.id) || hasStoredOpenDescendant(l, ids),
  );
}

function ListItem({
  node,
  render,
  level,
  className,
  isOpenFunc,
  listStats,
  indentOffset,
}: {
  node: ZBookmarkListTreeNode;
  render: RenderFunc;
  isOpenFunc: IsOpenFunc;
  listStats?: Map<string, number>;
  level: number;
  indentOffset: number;
  className?: string;
}) {
  // Not the most efficient way to do this, but it works for now
  const isAnyChildOpen = (
    node: ZBookmarkListTreeNode,
    isOpenFunc: IsOpenFunc,
  ): boolean => {
    if (isOpenFunc(node)) {
      return true;
    }
    return node.children.some((l) => isAnyChildOpen(l, isOpenFunc));
  };

  // Initial render must match the server (which can't read localStorage),
  // so stored opens are applied in the effect below, after hydration.
  const [open, setOpen] = useState(false);

  // clicks persist (storage), route derivations dont: the effect below
  // may open rows for the current route without writing anything.
  // folding a row also forgets its subtree: a stored-open descendant
  // would otherwise force this row back open on the next load,
  // against the explicit fold.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    const ids = readOpenListIdsFromStorage();
    if (next) {
      ids.add(node.item.id);
    } else {
      ids.delete(node.item.id);
      for (const id of collectSubtreeIds(node)) {
        ids.delete(id);
      }
    }
    writeOpenListIdsToStorage(ids);
  };
  useEffect(() => {
    const ids = readOpenListIdsFromStorage();
    setOpen(
      (curr) =>
        curr ||
        ids.has(node.item.id) ||
        // a stored-open descendant implies its ancestors were open too:
        // reopening them rebuilds the tree exactly as the user left it.
        hasStoredOpenDescendant(node, ids) ||
        isAnyChildOpen(node, isOpenFunc),
    );
  }, [node, isOpenFunc]);

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={className}
    >
      {render({
        node,
        level: level + indentOffset,
        open,
        onOpenChange: handleOpenChange,
        numBookmarks: listStats?.get(node.item.id),
      })}
      <CollapsibleContent>
        {node.children
          .sort((a, b) => a.item.name.localeCompare(b.item.name))
          .map((l) => (
            <ListItem
              isOpenFunc={isOpenFunc}
              key={l.item.id}
              node={l}
              render={render}
              level={level + 1}
              indentOffset={indentOffset}
              listStats={listStats}
              className={className}
            />
          ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CollapsibleBookmarkLists({
  render,
  initialData,
  listsData,
  className,
  isOpenFunc,
  filter,
  indentOffset = 0,
}: {
  initialData?: ZBookmarkList[];
  listsData?: {
    data: ZBookmarkList[];
    root: Record<string, ZBookmarkListTreeNode>;
    allPaths: ZBookmarkList[][];
    getPathById: (id: string) => ZBookmarkList[] | undefined;
  };
  render: RenderFunc;
  isOpenFunc?: IsOpenFunc;
  className?: string;
  filter?: (node: ZBookmarkListTreeNode) => boolean;
  indentOffset?: number;
}) {
  const api = useTRPC();
  // If listsData is provided, use it directly. Otherwise, fetch it.
  let { data: fetchedData } = useBookmarkLists(undefined, {
    initialData: initialData ? { lists: initialData } : undefined,
    enabled: !listsData, // Only fetch if listsData is not provided
  });
  const data = listsData || fetchedData;

  const { data: listStats } = useQuery(
    api.lists.stats.queryOptions(undefined, {
      placeholderData: keepPreviousData,
    }),
  );

  if (!data) {
    return <FullPageSpinner />;
  }

  const rootNodes = Object.values(data.root);
  const filteredRoots = filter ? rootNodes.filter(filter) : rootNodes;

  return (
    <div>
      {filteredRoots
        .sort((a, b) => a.item.name.localeCompare(b.item.name))
        .map((node) => (
          <ListItem
            key={node.item.id}
            node={node}
            render={render}
            level={0}
            indentOffset={indentOffset}
            className={className}
            listStats={listStats?.stats}
            isOpenFunc={isOpenFunc ?? (() => false)}
          />
        ))}
    </div>
  );
}
