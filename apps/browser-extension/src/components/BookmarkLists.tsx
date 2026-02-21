import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import {
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";

import { useTRPC } from "../utils/trpc";
import { Button } from "./ui/button";

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

  return (
    <ul className="flex flex-col gap-1">
      {lists.lists.map((l) => (
        <li
          key={l.id}
          className="flex items-center justify-between rounded border border-border bg-background p-2 text-sm text-foreground"
        >
          <span>
            {allLists
              .getPathById(l.id)!
              .map((l) => `${l.icon} ${l.name}`)
              .join(" / ")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteFromList({ bookmarkId, listId: l.id })}
          >
            <X className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
