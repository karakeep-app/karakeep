import { redirect } from "next/navigation";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";

import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

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
    <DenseFilesView
      label={label}
      query={query}
      initialBookmarks={bookmarks}
      // /dashboard/search throws outright when no search backend is
      // registered, so the header's search affordance must not offer to
      // navigate there unless it will actually work.
      searchEnabled={PluginManager.isRegistered(PluginType.Search)}
    />
  );
}
