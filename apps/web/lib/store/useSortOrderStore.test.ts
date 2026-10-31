// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useSortOrderStore } from "./useSortOrderStore";

describe("useSortOrderStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSortOrderStore.persist.clearStorage();
    useSortOrderStore.setState({
      sortOrder: "desc",
      defaultSortOrder: "desc",
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("keeps the saved default sort order when relevance is selected", () => {
    useSortOrderStore.getState().setSortOrder("asc");
    useSortOrderStore.getState().setSortOrder("relevance");

    expect(useSortOrderStore.getState()).toMatchObject({
      sortOrder: "relevance",
      defaultSortOrder: "asc",
    });
  });

  it("rehydrates the saved default sort order", () => {
    localStorage.setItem(
      "karakeep-sort-order",
      JSON.stringify({
        state: { defaultSortOrder: "asc" },
        version: 0,
      }),
    );

    useSortOrderStore.persist.rehydrate();

    expect(useSortOrderStore.getState()).toMatchObject({
      sortOrder: "asc",
      defaultSortOrder: "asc",
    });
  });

  it("falls back to the default sort order when persisted state is partial", () => {
    localStorage.setItem(
      "karakeep-sort-order",
      JSON.stringify({
        state: {},
        version: 0,
      }),
    );

    useSortOrderStore.persist.rehydrate();

    expect(useSortOrderStore.getState()).toMatchObject({
      sortOrder: "desc",
      defaultSortOrder: "desc",
    });
  });
});
