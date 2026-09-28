import { beforeEach, describe, expect, it } from "vitest";

import { useManageListsModalStore } from "./useManageListsModalStore";

describe("useManageListsModalStore", () => {
  beforeEach(() => {
    useManageListsModalStore.setState({ bookmarkId: null });
  });

  it("starts closed", () => {
    expect(useManageListsModalStore.getState().bookmarkId).toBeNull();
  });

  it("opens for a given bookmark and can be closed again", () => {
    useManageListsModalStore.getState().setBookmarkId("bookmark-1");
    expect(useManageListsModalStore.getState().bookmarkId).toBe("bookmark-1");

    useManageListsModalStore.getState().setBookmarkId(null);
    expect(useManageListsModalStore.getState().bookmarkId).toBeNull();
  });

  it("switching to a different bookmark replaces the open one", () => {
    useManageListsModalStore.getState().setBookmarkId("bookmark-1");
    useManageListsModalStore.getState().setBookmarkId("bookmark-2");
    expect(useManageListsModalStore.getState().bookmarkId).toBe("bookmark-2");
  });
});
