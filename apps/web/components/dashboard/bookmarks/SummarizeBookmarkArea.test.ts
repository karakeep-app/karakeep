// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import SummarizeBookmarkArea from "./SummarizeBookmarkArea";

const state = vi.hoisted(() => ({
  isInferenceConfigured: false,
  resummarize: vi.fn(),
  updateBookmark: vi.fn(),
}));

vi.mock("@karakeep/shared/types/bookmarks", () => ({
  BookmarkTypes: {
    LINK: "link",
    TEXT: "text",
    ASSET: "asset",
    UNKNOWN: "unknown",
  },
}));

vi.mock("@karakeep/shared-react/hooks/bookmarks", () => ({
  useSummarizeBookmark: () => ({
    mutate: state.resummarize,
    isPending: false,
  }),
  useUpdateBookmark: () => ({
    mutate: state.updateBookmark,
    isPending: false,
  }),
}));

vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({
    inference: { isConfigured: state.isInferenceConfigured },
  }),
}));

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

vi.mock("@/components/shared/sidebar/SidebarSectionHeading", () => ({
  default: (props: { children?: React.ReactNode }) =>
    React.createElement("h3", null, props.children),
}));

vi.mock("@/components/ui/action-button", () => ({
  ActionButton: (props: {
    children?: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        onClick: props.onClick,
        "aria-label": props["aria-label"],
      },
      props.children,
    ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: {
    children?: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        onClick: props.onClick,
        "aria-label": props["aria-label"],
      },
      props.children,
    ),
}));

vi.mock("@/components/ui/markdown/markdown-readonly", () => ({
  MarkdownReadonly: (props: { children?: React.ReactNode }) =>
    React.createElement("div", null, props.children),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: vi.fn(),
}));

vi.mock("@/components/ui/spinner", () => ({
  default: () => null,
}));

vi.mock("../preview/IconControl", () => ({
  DESTRUCTIVE_ICON_CONTROL_CLASS: "destructive",
  ICON_CONTROL_CLASS: "icon",
  IconTooltip: (props: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, props.children),
}));

vi.mock("lucide-react", () => ({
  ChevronUp: () => null,
  RefreshCw: () => null,
  Sparkles: () => null,
  Trash2: () => null,
}));

function makeBookmark(
  type: "link" | "text" | "asset",
  summary: string | null,
): ZBookmark {
  return {
    id: `bookmark-${type}`,
    summary,
    content: { type },
  } as unknown as ZBookmark;
}

describe("SummarizeBookmarkArea", () => {
  beforeEach(() => {
    state.isInferenceConfigured = false;
    state.resummarize.mockClear();
    state.updateBookmark.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an existing summary for a text bookmark even when inference is off", () => {
    render(
      React.createElement(SummarizeBookmarkArea, {
        bookmark: makeBookmark("text", "Imported text summary"),
      }),
    );

    expect(screen.getByText("common.summary")).toBeTruthy();
    expect(screen.getByText("Imported text summary")).toBeTruthy();
  });

  it("hides resummarize for non-link bookmarks while keeping delete summary available", () => {
    state.isInferenceConfigured = true;
    render(
      React.createElement(SummarizeBookmarkArea, {
        bookmark: makeBookmark("text", "Imported text summary"),
      }),
    );

    fireEvent.click(screen.getByText("Imported text summary"));

    expect(screen.queryByLabelText("actions.resummarize")).toBeNull();
    const deleteButton = screen.getByLabelText("actions.delete_summary");
    fireEvent.click(deleteButton);

    expect(state.updateBookmark).toHaveBeenCalledWith({
      bookmarkId: "bookmark-text",
      summary: null,
    });
  });

  it("keeps resummarize enabled when expanding a link bookmark summary", () => {
    render(
      React.createElement(SummarizeBookmarkArea, {
        bookmark: makeBookmark("link", "Existing link summary"),
      }),
    );

    fireEvent.click(screen.getByText("Existing link summary"));

    const resummarizeButton = screen.getByLabelText("actions.resummarize");
    fireEvent.click(resummarizeButton);

    expect(state.resummarize).toHaveBeenCalledWith({
      bookmarkId: "bookmark-link",
    });
  });

  it("does not render the Summarize with AI action for text bookmarks without a summary", () => {
    state.isInferenceConfigured = true;
    const { container } = render(
      React.createElement(SummarizeBookmarkArea, {
        bookmark: makeBookmark("text", null),
      }),
    );

    expect(container.firstChild).toBeNull();
  });
});
