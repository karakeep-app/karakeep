import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";

import { useTRPC } from "../utils/trpc";

export function byListPathName(a: ZBookmarkList[], b: ZBookmarkList[]) {
  const commonPathLength = Math.min(a.length, b.length);

  for (let index = 0; index < commonPathLength; index++) {
    const comparison = a[index].name.localeCompare(b[index].name);
    if (comparison !== 0) return comparison;
  }

  return a.length - b.length;
}

export function ListPathLabel({ path }: { path: ZBookmarkList[] }) {
  const list = path[path.length - 1];
  // The full path lives in the tooltip; the direct parent is what tells
  // similarly named lists apart.
  const parent = path.length > 1 ? path[path.length - 2] : undefined;
  return (
    <span
      className="flex min-w-0 flex-1 items-center gap-2"
      title={path.map((l) => l.name).join(" / ")}
    >
      <span className="shrink-0 text-base leading-none">{list.icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{list.name}</span>
        {parent && (
          <span className="truncate text-xs text-muted-foreground">
            in {parent.name}
          </span>
        )}
      </span>
    </span>
  );
}

export default function BookmarkLists({ bookmarkId }: { bookmarkId: string }) {
  const api = useTRPC();
  const { data: allLists } = useBookmarkLists();

  const { mutate: deleteFromList } = useRemoveBookmarkFromList();

  const { data: lists } = useQuery(
    api.lists.getListsOfBookmark.queryOptions({ bookmarkId }),
  );
  if (!lists || !allLists) {
    return null;
  }

  const paths = lists.lists
    .map((l) => allLists.getPathById(l.id) ?? [l])
    .sort(byListPathName);

  return (
    <>
      {paths.map((path) => {
        const list = path[path.length - 1];
        return (
          <div
            key={list.id}
            className="flex h-11 items-center gap-2 pl-3 pr-1 text-sm"
          >
            <ListPathLabel path={path} />
            <button
              type="button"
              onClick={() => deleteFromList({ bookmarkId, listId: list.id })}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`Remove from ${list.name}`}
              title="Remove from list"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </>
  );
}
