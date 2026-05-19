// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useBulkActionsStore from "@/lib/bulkActions";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { useBookmarkKeyboardNavigation } from "./useBookmarkKeyboardNavigation";

const mocks = vi.hoisted(() => ({
  hotkeys: [] as {
    keys: string;
    callback: () => void;
    options?: { enabled?: boolean };
  }[],
  push: vi.fn(),
  pathname: "/dashboard/bookmarks",
  updateMutate: vi.fn(),
  updateMutateAsync: vi.fn(),
  deleteMutate: vi.fn(),
  deleteMutateAsync: vi.fn(),
  recrawlMutateAsync: vi.fn(),
  removeFromListMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: (
    keys: string,
    callback: () => void,
    options?: { enabled?: boolean },
  ) => {
    mocks.hotkeys.push({ keys, callback, options });
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}));

vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ data: { user: { id: "user-1" } } }),
}));

vi.mock("../i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@karakeep/shared-react/hooks/bookmarks", () => ({
  useUpdateBookmark: () => ({
    mutate: mocks.updateMutate,
    mutateAsync: mocks.updateMutateAsync,
    isPending: false,
  }),
  useDeleteBookmark: () => ({
    mutate: mocks.deleteMutate,
    mutateAsync: mocks.deleteMutateAsync,
    isPending: false,
  }),
  useRecrawlBookmark: () => ({
    mutateAsync: mocks.recrawlMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@karakeep/shared-react/hooks/lists", () => ({
  useRemoveBookmarkFromList: () => ({
    mutateAsync: mocks.removeFromListMutateAsync,
    isPending: false,
  }),
}));

function bookmark(
  id: string,
  {
    userId = "user-1",
    favourited = false,
    archived = false,
  }: { userId?: string; favourited?: boolean; archived?: boolean } = {},
) {
  return {
    id,
    userId,
    favourited,
    archived,
    content: {
      type: "link",
      url: `https://example.com/${id}`,
    },
  } as ZBookmark;
}

function renderKeyboardHook(
  bookmarks = [bookmark("a"), bookmark("b")],
  {
    hasNextPage = false,
    isFetchingNextPage = false,
    fetchNextPage = vi.fn(),
  }: {
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
  } = {},
) {
  return renderHook(() =>
    useBookmarkKeyboardNavigation({
      bookmarks,
      columns: 2,
      hasNextPage,
      isFetchingNextPage,
      fetchNextPage,
    }),
  );
}

function hotkey(keys: string) {
  const registration = [...mocks.hotkeys]
    .reverse()
    .find((item) => item.keys === keys);
  if (!registration) {
    throw new Error(`Missing hotkey registration for ${keys}`);
  }
  return registration;
}

describe("useBookmarkKeyboardNavigation", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hotkeys = [];
    mocks.pathname = "/dashboard/bookmarks";
    mocks.updateMutateAsync.mockImplementation((input) =>
      Promise.resolve({ id: input.bookmarkId, ...input }),
    );
    mocks.deleteMutateAsync.mockResolvedValue({});
    useBulkActionsStore.setState({
      selectedBookmarkIds: [],
      visibleBookmarks: [],
      isBulkEditEnabled: false,
      listContext: undefined,
    });
    useKeyboardNavigationStore.setState({
      focusedIndex: -1,
      isNavigating: false,
      shortcutsDialogOpen: false,
    });
  });

  it("registers movement hotkeys that move keyboard focus", () => {
    renderKeyboardHook([bookmark("a"), bookmark("b"), bookmark("c")]);

    expect(hotkey("j").options?.enabled).toBe(true);

    act(() => {
      hotkey("j").callback();
    });
    expect(useKeyboardNavigationStore.getState().focusedIndex).toBe(0);

    act(() => {
      hotkey("j").callback();
    });
    expect(useKeyboardNavigationStore.getState().focusedIndex).toBe(2);
  });

  it("does not fetch the next page while one is already loading", () => {
    const fetchNextPage = vi.fn();
    useKeyboardNavigationStore.setState({
      focusedIndex: 1,
      isNavigating: true,
    });

    renderKeyboardHook([bookmark("a"), bookmark("b")], {
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage,
    });

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("toggles the focused bookmark into bulk selection with x", () => {
    const bookmarks = [bookmark("a"), bookmark("b")];
    useKeyboardNavigationStore.setState({
      focusedIndex: 0,
      isNavigating: true,
    });

    renderKeyboardHook(bookmarks);

    act(() => {
      hotkey("x").callback();
    });

    expect(useBulkActionsStore.getState().isBulkEditEnabled).toBe(true);
    expect(useBulkActionsStore.getState().visibleBookmarks).toEqual([]);
    expect(useBulkActionsStore.getState().selectedBookmarkIds).toEqual(["a"]);
  });

  it("supports the select-all keyboard sequence", () => {
    const bookmarks = [bookmark("a"), bookmark("b")];
    renderKeyboardHook(bookmarks);

    act(() => {
      hotkey("shift+8").callback();
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          bubbles: true,
        }),
      );
    });

    expect(useBulkActionsStore.getState().selectedBookmarkIds).toEqual([
      "a",
      "b",
    ]);
  });

  it("opens the focused bookmark with enter or o", () => {
    useKeyboardNavigationStore.setState({
      focusedIndex: 1,
      isNavigating: true,
    });

    renderKeyboardHook([bookmark("a"), bookmark("b")]);

    act(() => {
      hotkey("o,enter").callback();
    });

    expect(mocks.push).toHaveBeenCalledWith("/dashboard/preview/b");
  });

  it("updates only owned focused bookmarks from single-bookmark hotkeys", () => {
    useKeyboardNavigationStore.setState({
      focusedIndex: 0,
      isNavigating: true,
    });

    const { unmount } = renderKeyboardHook([
      bookmark("a", { userId: "user-2" }),
    ]);

    act(() => {
      hotkey("f").callback();
    });
    expect(mocks.updateMutate).not.toHaveBeenCalled();

    unmount();
    mocks.hotkeys = [];
    useKeyboardNavigationStore.setState({
      focusedIndex: 0,
      isNavigating: true,
    });
    renderKeyboardHook([bookmark("owned", { favourited: false })]);

    act(() => {
      hotkey("f").callback();
    });

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      {
        bookmarkId: "owned",
        favourited: true,
      },
      expect.any(Object),
    );
  });

  it("bulk favorite only updates selected owned bookmarks", async () => {
    const bookmarks = [
      bookmark("owned", { userId: "user-1" }),
      bookmark("shared", { userId: "user-2" }),
    ];
    useBulkActionsStore.setState({
      isBulkEditEnabled: true,
      visibleBookmarks: bookmarks,
      selectedBookmarkIds: ["owned", "shared"],
    });
    useKeyboardNavigationStore.setState({
      focusedIndex: 0,
      isNavigating: true,
    });

    renderKeyboardHook(bookmarks);

    await act(async () => {
      hotkey("f").callback();
      await Promise.resolve();
    });

    expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
      bookmarkId: "owned",
      favourited: true,
    });
  });

  it("falls back to the focused bookmark when bulk selection is not actionable", () => {
    const bookmarks = [bookmark("current", { favourited: false })];
    useBulkActionsStore.setState({
      isBulkEditEnabled: true,
      visibleBookmarks: bookmarks,
      selectedBookmarkIds: ["filtered-out"],
    });
    useKeyboardNavigationStore.setState({
      focusedIndex: 0,
      isNavigating: true,
    });

    renderKeyboardHook(bookmarks);

    act(() => {
      hotkey("f").callback();
    });

    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      {
        bookmarkId: "current",
        favourited: true,
      },
      expect.any(Object),
    );
  });
});
