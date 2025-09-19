"use client";

import { createContext, useContext } from "react";

import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";

export const BookmarkGridContext = createContext<
  ZGetBookmarksRequest | undefined
>(undefined);

export function BookmarkGridContextProvider({
  query,
  children,
}: {
  query: ZGetBookmarksRequest;
  children: React.ReactNode;
}) {
  return (
    <BookmarkGridContext.Provider value={query}>
      {children}
    </BookmarkGridContext.Provider>
  );
}

export function useBookmarkGridContext() {
  return useContext(BookmarkGridContext);
}
