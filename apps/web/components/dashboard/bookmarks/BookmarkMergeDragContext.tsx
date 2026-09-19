"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export interface BookmarkMergeDragContextValue {
  activeSourceId: string | null;
  activeTargetId: string | null;

  onBookmarkDragStart: (bookmarkId: string) => void;
  onBookmarkDragEnd: () => void;

  isValidMergeTarget: (bookmarkId: string) => boolean;
  onBookmarkTargetEnter: (bookmarkId: string) => void;
  onBookmarkTargetLeave: (bookmarkId: string) => void;
  onBookmarkDrop: (
    transferredSourceId: string,
    targetBookmarkId: string,
  ) => void;
}

interface BookmarkMergeDragProviderProps {
  value: BookmarkMergeDragContextValue;
  children: ReactNode;
}

const BookmarkMergeDragContext = createContext<
  BookmarkMergeDragContextValue | undefined
>(undefined);

export function BookmarkMergeDragProvider({
  value,
  children,
}: BookmarkMergeDragProviderProps) {
  return (
    <BookmarkMergeDragContext.Provider value={value}>
      {children}
    </BookmarkMergeDragContext.Provider>
  );
}

export function useBookmarkMergeDrag() {
  const context = useContext(BookmarkMergeDragContext);

  if (!context) {
    throw new Error(
      "useBookmarkMergeDrag must be used within a BookmarkMergeDragProvider",
    );
  }

  return context;
}
