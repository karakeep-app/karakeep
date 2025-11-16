import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";
import { Users } from "lucide-react";

import UpdatableBookmarksGrid from "./UpdatableBookmarksGrid";

export default async function SharedBookmarks() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  // Get all lists shared with the current user
  const { lists: sharedLists } = await api.lists.getSharedWithMe();

  if (sharedLists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Alert className="max-w-md">
          <Users className="h-4 w-4" />
          <AlertDescription>
            No lists have been shared with you yet. When someone shares a list
            with you, the bookmarks from that list will appear here.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Get all bookmark IDs from shared lists
  for (const list of sharedLists) {
    if (list.type === "manual") {
      // For manual lists, we can get bookmarks directly
      // We'll load them using the listId filter
      continue;
    }
  }

  // For now, we'll show bookmarks from the first shared list
  // A more complete implementation would aggregate bookmarks from all shared lists
  const firstListId = sharedLists[0]?.id;

  if (!firstListId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Alert className="max-w-md">
          <AlertDescription>
            No bookmarks found in shared lists.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Get bookmarks from the shared list
  const bookmarks = await api.bookmarks.getBookmarks({
    listId: firstListId,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-muted-foreground">
        Showing bookmarks from {sharedLists.length} shared{" "}
        {sharedLists.length === 1 ? "list" : "lists"}
      </div>
      <UpdatableBookmarksGrid
        query={{ listId: firstListId }}
        bookmarks={bookmarks}
        showEditorCard={false}
      />
    </div>
  );
}
