import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  safeDecodeURIComponent,
  useDoBookmarkSearch,
  useSearchQuery,
} from "../bookmark-search";

// Mock Next.js navigation hooks
let mockQueryString = "";
const mockUseSearchParams = () => new URLSearchParams(mockQueryString);
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  useSearchParams: () => mockUseSearchParams(),
}));

// Mock the store hooks
vi.mock("@/lib/store/useSortOrderStore", () => ({
  useSortOrderStore: vi.fn(() => ({ sortOrder: "newest" })),
}));

vi.mock("../store/useInSearchPageStore", () => ({
  useInSearchPageStore: vi.fn(() => false),
}));

// Mock the API
vi.mock("@/lib/trpc", () => ({
  api: {
    bookmarks: {
      searchBookmarks: {
        useInfiniteQuery: vi.fn(() => ({
          data: undefined,
          isPending: false,
          isPlaceholderData: false,
          error: null,
          hasNextPage: false,
          fetchNextPage: vi.fn(),
          isFetchingNextPage: false,
          refetch: vi.fn(),
        })),
      },
    },
  },
}));

// Mock the search query parser
vi.mock("@karakeep/shared/searchQueryParser", () => ({
  parseSearchQuery: vi.fn((query: string) => ({
    type: "text",
    value: query,
  })),
}));

describe("safeDecodeURIComponent", () => {
  it("should decode properly encoded URI components", () => {
    expect(safeDecodeURIComponent("hello%20world")).toBe("hello world");
    expect(safeDecodeURIComponent("test%2Bvalue")).toBe("test+value");
    expect(safeDecodeURIComponent("100%25")).toBe("100%");
  });

  it("should return raw string for malformed percent encoding", () => {
    // Malformed percent encoding that would cause URIError
    expect(safeDecodeURIComponent("%")).toBe("%");
    expect(safeDecodeURIComponent("%1")).toBe("%1");
    expect(safeDecodeURIComponent("100%")).toBe("100%");
    expect(safeDecodeURIComponent("%XY")).toBe("%XY");
    expect(safeDecodeURIComponent("%G0")).toBe("%G0");
  });

  it("should handle empty strings", () => {
    expect(safeDecodeURIComponent("")).toBe("");
  });

  it("should handle strings without percent encoding", () => {
    expect(safeDecodeURIComponent("normal string")).toBe("normal string");
    expect(safeDecodeURIComponent("100% complete")).toBe("100% complete");
  });

  it("should re-throw non-URIError exceptions", () => {
    // Mock decodeURIComponent to throw a non-URIError
    const originalDecodeURIComponent = global.decodeURIComponent;
    global.decodeURIComponent = vi.fn(() => {
      throw new Error("Some other error");
    });

    expect(() => safeDecodeURIComponent("test")).toThrow("Some other error");

    // Restore original function
    global.decodeURIComponent = originalDecodeURIComponent;
  });
});

describe("useSearchQuery", () => {
  beforeEach(() => {
    mockQueryString = "";
  });

  it("should return empty search query when no q parameter", () => {
    const { result } = renderHook(() => useSearchQuery());
    expect(result.current.searchQuery).toBe("");
    expect(result.current.parsedSearchQuery).toEqual({
      type: "text",
      value: "",
    });
  });

  it("should decode and return search query from URL parameters", () => {
    mockQueryString = "q=hello%20world";
    const { result } = renderHook(() => useSearchQuery());
    expect(result.current.searchQuery).toBe("hello world");
  });

  it("should handle malformed percent encoding in URL parameters", () => {
    mockQueryString = "q=%";
    const { result } = renderHook(() => useSearchQuery());
    expect(result.current.searchQuery).toBe("%");
  });

  it("should handle percent symbol in search query", () => {
    mockQueryString = "q=100%25";
    const { result } = renderHook(() => useSearchQuery());
    expect(result.current.searchQuery).toBe("100%");
  });

  it("should handle multiple malformed percent encodings", () => {
    mockQueryString = "q=%1%XY%G0";
    const { result } = renderHook(() => useSearchQuery());
    expect(result.current.searchQuery).toBe("%1%XY%G0");
  });
});

describe("useDoBookmarkSearch", () => {
  beforeEach(() => {
    mockQueryString = "";
  });

  it("should provide search functions and current query state", () => {
    const { result } = renderHook(() => useDoBookmarkSearch());
    expect(result.current).toHaveProperty("doSearch");
    expect(result.current).toHaveProperty("debounceSearch");
    expect(result.current).toHaveProperty("searchQuery");
    expect(result.current).toHaveProperty("parsedSearchQuery");
    expect(result.current).toHaveProperty("isInSearchPage");

    expect(typeof result.current.doSearch).toBe("function");
    expect(typeof result.current.debounceSearch).toBe("function");
    expect(result.current.searchQuery).toBe("");
  });

  it("should handle malformed percent encoding without crashing", () => {
    mockQueryString = "q=%";
    const { result } = renderHook(() => useDoBookmarkSearch());
    expect(result.current.searchQuery).toBe("%");
    // Should not throw an error
  });
});
