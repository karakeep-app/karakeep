// @vitest-environment jsdom

import type { ComponentProps, PropsWithChildren } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserLocalSettingsCtx } from "@/lib/userLocalSettings/bookmarksLayout";
import { defaultUserLocalSettings } from "@/lib/userLocalSettings/types";

import type BookmarksGrid from "./BookmarksGrid";
import type EditorCard from "./EditorCard";
import UpdatableBookmarksGrid from "./UpdatableBookmarksGrid";

vi.mock("@tanstack/react-query", () => {
  const refetch = vi.fn();
  return {
    useInfiniteQuery: () => ({ data: { pages: [{ bookmarks: [] }] }, refetch }),
  };
});

vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    bookmarks: { getBookmarks: { infiniteQueryOptions: vi.fn() } },
  }),
}));

vi.mock("@/components/dashboard/UploadDropzone", () => ({
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="upload-dropzone">{children}</div>
  ),
}));

vi.mock("./BookmarksGrid", () => ({
  default: ({
    showEditorCard,
    keyboardNavigationDisabled,
  }: ComponentProps<typeof BookmarksGrid>) => (
    <div
      data-testid="bookmarks-grid"
      data-hotkeys-disabled={keyboardNavigationDisabled}
    >
      {showEditorCard && <div>New item card</div>}
    </div>
  ),
}));

vi.mock("./EditorCard", () => ({
  default: ({ dialog }: ComponentProps<typeof EditorCard>) =>
    dialog && (
      <button type="button" onClick={() => dialog.onOpenChange(!dialog.open)}>
        {dialog.open ? "Close" : "New item dialog"}
      </button>
    ),
}));

function grid(showNewItemCard: boolean, canCreateBookmarks = true) {
  return (
    <UserLocalSettingsCtx.Provider
      value={{ ...defaultUserLocalSettings(), showNewItemCard }}
    >
      <UpdatableBookmarksGrid
        query={{}}
        bookmarks={{ bookmarks: [], nextCursor: null }}
        showEditorCard={canCreateBookmarks}
      />
    </UserLocalSettingsCtx.Provider>
  );
}

describe("new item card visibility", () => {
  afterEach(cleanup);

  it("keeps uploads and the keyboard editor available when the card is hidden", () => {
    const { rerender } = render(grid(true));
    const dropzone = screen.getByTestId("upload-dropzone");
    expect(screen.queryByText("New item card")).not.toBeNull();
    expect(screen.queryByText("New item dialog")).toBeNull();

    rerender(grid(false));
    expect(screen.queryByText("New item card")).toBeNull();
    expect(screen.queryByText("New item dialog")).not.toBeNull();
    expect(screen.getByTestId("upload-dropzone")).toBe(dropzone);
  });

  it("pauses grid shortcuts until the new item dialog closes", () => {
    render(grid(false));
    const bookmarksGrid = screen.getByTestId("bookmarks-grid");
    expect(bookmarksGrid.getAttribute("data-hotkeys-disabled")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "New item dialog" }));
    expect(bookmarksGrid.getAttribute("data-hotkeys-disabled")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(bookmarksGrid.getAttribute("data-hotkeys-disabled")).toBe("false");
  });

  it.each([true, false])(
    "keeps creation unavailable on read-only grids with the preference set to %s",
    (showNewItemCard) => {
      render(grid(showNewItemCard, false));

      expect(screen.queryByText("New item card")).toBeNull();
      expect(screen.queryByText("New item dialog")).toBeNull();
      expect(screen.queryByTestId("upload-dropzone")).toBeNull();
    },
  );
});
