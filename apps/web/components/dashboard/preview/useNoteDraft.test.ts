// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNoteDraft } from "./useNoteDraft";

interface Request {
  bookmarkId: string;
  note?: string;
}

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  options: {} as {
    scope?: { id: string };
    onError?: (error: unknown, request: Request) => void;
  },
  toastError: vi.fn(),
}));

vi.mock("@karakeep/shared-react/hooks/bookmarks", () => ({
  useUpdateBookmark: (options: typeof mocks.options) => {
    mocks.options = options;
    return { mutate: mocks.mutate, isPending: mocks.isPending };
  },
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    bookmarks: { getBookmark: { queryFilter: (input: unknown) => input } },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueriesData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, dismiss: vi.fn() },
}));

function setup(savedNote: string) {
  return renderHook(
    (props: { savedNote: string }) =>
      useNoteDraft("bookmark-1", props.savedNote),
    { initialProps: { savedNote } },
  );
}

const saved = (note: string) => ({ bookmarkId: "bookmark-1", note });

describe("useNoteDraft", () => {
  beforeEach(() => {
    mocks.mutate.mockClear();
    mocks.toastError.mockClear();
    mocks.isPending = false;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("saves shortly after typing stops", () => {
    vi.useFakeTimers();
    const { result } = setup("");
    act(() => result.current.onChange("typed"));
    expect(mocks.mutate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(800));
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(saved("typed"));
  });

  it("saves typed text on unmount without a blur, as Escape does", () => {
    const { result, unmount } = setup("");
    act(() => result.current.onChange("typed"));
    unmount();
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(saved("typed"));
  });

  it("doesn't save twice when blurred and then unmounted", () => {
    const { result, unmount } = setup("");
    act(() => result.current.onChange("typed"));
    act(() => result.current.flush());
    unmount();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });

  it("never saves from the hidden layout's copy, which nobody typed in", () => {
    const { result, rerender, unmount } = setup("");
    rerender({ savedNote: "saved elsewhere" });
    expect(result.current.value).toBe("saved elsewhere");
    act(() => result.current.flush());
    unmount();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("doesn't replace text being typed when the bookmark refreshes", () => {
    const { result, rerender } = setup("");
    act(() => result.current.onChange("typing"));
    rerender({ savedNote: "from elsewhere" });
    expect(result.current.value).toBe("typing");
  });

  it("runs saves one at a time", () => {
    setup("");
    expect(mocks.options.scope).toEqual({ id: "note-bookmark-1" });
  });

  it("keeps the text after a failed save, and retries it", () => {
    const { result, rerender } = setup("before");
    act(() => result.current.onChange("typed"));
    act(() => result.current.flush());
    act(() => mocks.options.onError?.(new Error("nope"), saved("typed")));
    expect(result.current.status).toBe("failed");
    // The refetch brings back what the server has.
    rerender({ savedNote: "before" });
    expect(result.current.value).toBe("typed");
    const retry = mocks.toastError.mock.lastCall?.[1].action.onClick;
    act(() => retry());
    expect(mocks.mutate).toHaveBeenLastCalledWith(saved("typed"));
  });

  it("ignores the failure of a save that a newer one replaces", () => {
    const { result } = setup("");
    act(() => result.current.onChange("older"));
    act(() => result.current.flush());
    act(() => result.current.onChange("newer"));
    act(() => result.current.flush());
    act(() => mocks.options.onError?.(new Error("nope"), saved("older")));
    expect(mocks.toastError).not.toHaveBeenCalled();
    act(() => result.current.flush());
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });

  it("asks before the page unloads with unsent text", () => {
    const { result } = setup("");
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    act(() => result.current.onChange("typed"));
    expect(unload()).toBe(true);
    act(() => result.current.flush());
    expect(unload()).toBe(false);
  });
});
