"use client";

import { createContext, useContext } from "react";

import { ZBookmarkList } from "@karakeep/shared/types/lists";

export const BookmarkListContext = createContext<ZBookmarkList | undefined>(
  undefined,
);

export function BookmarkListContextProvider({
  list,
  children,
}: {
  list: ZBookmarkList;
  children: React.ReactNode;
}) {
  return (
    <BookmarkListContext.Provider value={list}>
      {children}
    </BookmarkListContext.Provider>
  );
}

export function useBookmarkListContext() {
  return useContext(BookmarkListContext);
}
