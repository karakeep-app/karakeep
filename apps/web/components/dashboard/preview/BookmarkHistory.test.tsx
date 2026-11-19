// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import BookmarkHistory from "./BookmarkHistory";
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    bookmarks: { getHistory: { infiniteQueryOptions: () => ({}) } },
  }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => ({
    data: {
      pages: [
        {
          events: [
            {
              id: "event",
              createdAt: new Date(),
              type: "edit",
              changes: [
                { field: "title", oldValue: "Before", newValue: "After" },
              ],
            },
          ],
        },
      ],
    },
    isPending: false,
    isError: false,
    hasNextPage: false,
  }),
}));
afterEach(cleanup);
test("shows saved old and new values after expanding history", () => {
  render(<BookmarkHistory bookmarkId="bookmark" />);
  expect(screen.queryByText("title")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "item_history.title" }));
  expect(screen.getByText("title")).toBeTruthy();
  expect(screen.getByText(/Before[\s\S]*After/)).toBeTruthy();
});
