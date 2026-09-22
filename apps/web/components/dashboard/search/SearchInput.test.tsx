// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchInput } from "./SearchInput";

vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ search: { semanticSearchEnabled: false } }),
}));

vi.mock("@/lib/hooks/bookmark-search", () => ({
  useDoBookmarkSearch: () => ({
    debounceSearch: vi.fn(),
    searchQuery: "",
    doSearch: vi.fn(),
    setSearchMode: vi.fn(),
    searchMode: "fts",
    isInSearchPage: false,
  }),
}));

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@karakeep/shared-react/hooks/search-history", () => ({
  useSearchHistory: () => ({ addTerm: vi.fn(), history: [] }),
}));

vi.mock("./useSearchAutocomplete", () => ({
  useSearchAutocomplete: () => ({
    suggestionGroups: [],
    hasSuggestions: false,
    isPopoverVisible: false,
    handleSuggestionSelect: vi.fn(),
    handleCommandKeyDown: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock("../lists/EditListModal", () => ({
  EditListModal: () => null,
}));

vi.mock("./QueryExplainerTooltip", () => ({
  default: () => null,
}));

vi.mock("./SearchModeSelector", () => ({
  SearchModeSelector: () => null,
}));

afterEach(cleanup);

function renderSearchInput() {
  render(<SearchInput />);
  // cmdk renders the search box as a combobox, not a textbox.
  return screen.getByRole("combobox");
}

describe("SearchInput keyboard handling", () => {
  it("does not cancel Home/End so the browser can move the caret", () => {
    const input = renderSearchInput();

    // fireEvent.keyDown returns the result of dispatchEvent, i.e. `false`
    // when some handler called preventDefault(). cmdk's root handler cancels
    // Home/End to move the list selection, which would break caret movement.
    expect(fireEvent.keyDown(input, { key: "Home" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "End" })).toBe(true);
  });

  it("does not cancel Shift+Home/Shift+End so text selection keeps working", () => {
    const input = renderSearchInput();

    expect(fireEvent.keyDown(input, { key: "Home", shiftKey: true })).toBe(
      true,
    );
    expect(fireEvent.keyDown(input, { key: "End", shiftKey: true })).toBe(true);
  });

  it("does not cancel horizontal arrow keys", () => {
    const input = renderSearchInput();

    expect(fireEvent.keyDown(input, { key: "ArrowLeft" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "ArrowRight" })).toBe(true);
  });

  it("still lets cmdk cancel ArrowUp/ArrowDown for suggestion navigation", () => {
    const input = renderSearchInput();

    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "ArrowUp" })).toBe(false);
  });

  it("invokes a caller-supplied onKeyDown without losing the Home/End fix", () => {
    const onKeyDown = vi.fn();
    render(<SearchInput onKeyDown={onKeyDown} />);
    const input = screen.getByRole("combobox");

    expect(fireEvent.keyDown(input, { key: "a" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "Home" })).toBe(true);

    expect(onKeyDown).toHaveBeenCalledTimes(2);
  });
});
