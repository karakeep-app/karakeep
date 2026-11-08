import { redirect } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { getUserLocalSettings } from "@/lib/userLocalSettings/userLocalSettings";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";

import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";

import UpdatableBookmarksGrid from "./UpdatableBookmarksGrid";

export default async function Bookmarks({
  query,
  header,
  showDivider,
  showEditorCard = false,
}: {
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">; // Sort order comes from user local settings
  header?: React.ReactNode;
  showDivider?: boolean;
  showEditorCard?: boolean;
}) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  const { sortOrder } = await getUserLocalSettings();
  const bookmarks = await api.bookmarks.getBookmarks({
    ...query,
    sortOrder,
  });

  return (
    <div className="flex flex-col gap-3">
      {header}
      {showDivider && <Separator />}
      <UpdatableBookmarksGrid
        query={query}
        bookmarks={bookmarks}
        showEditorCard={showEditorCard}
      />
    </div>
  );
}
