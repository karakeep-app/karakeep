import { redirect } from "next/navigation";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";

import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";

import DenseFilesView from "./DenseFilesView";

/**
 * Server-fetches the first page of bookmarks for a given filter (inbox /
 * favourites / archive / list / tag) and hands off to the client-side
 * dense list/grid view. Mirrors the existing `Bookmarks.tsx` +
 * `UpdatableBookmarksGrid.tsx` split.
 */
export default async function DenseFiles({
  label,
  query,
}: {
  label: string;
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">;
}) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  const bookmarks = await api.bookmarks.getBookmarks({ ...query });

  return (
    <DenseFilesView label={label} query={query} initialBookmarks={bookmarks} />
  );
}
