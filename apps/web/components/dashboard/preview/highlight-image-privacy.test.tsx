// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HighlightContent from "@karakeep/shared-react/components/HighlightContent";
import { useHighlightImages } from "@karakeep/shared-react/hooks/highlightImages";
import type { ZHighlight } from "@karakeep/shared/types/highlights";

let viewerId: string | undefined;
vi.mock("@karakeep/shared-react/hooks/users", () => ({
  useWhoAmI: () => ({ data: viewerId ? { id: viewerId } : undefined }),
}));
afterEach(cleanup);

const highlight: ZHighlight = {
  id: "shared-highlight",
  userId: "author",
  bookmarkId: "bookmark",
  startOffset: 0,
  endOffset: 0,
  text: "[Diagram]",
  note: null,
  color: "yellow",
  createdAt: new Date(),
  content: {
    version: 1,
    parts: [
      {
        type: "image",
        index: 0,
        src: "http://127.0.0.1/private",
        alt: "Diagram",
      },
    ],
  },
};

function Card({ value = highlight }: { value?: ZHighlight }) {
  const { allowImages, hasBlockedImages, loadImages } =
    useHighlightImages(value);
  return (
    <>
      <HighlightContent
        content={value.content}
        text={value.text}
        allowImages={allowImages}
      />
      {hasBlockedImages && (
        <button onClick={loadImages}>Load shared images</button>
      )}
    </>
  );
}

describe("highlight image request privacy", () => {
  it("does not create image requests without an explicit loading policy", () => {
    const { container } = render(
      <HighlightContent content={highlight.content} text={highlight.text} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("[Diagram]");
  });

  it("blocks collaborator URLs until consent and scopes consent to URLs and account", () => {
    viewerId = "collaborator";
    const { container, getByRole, rerender } = render(<Card />);
    expect(container.querySelector("img")).toBeNull();
    fireEvent.click(getByRole("button"));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "http://127.0.0.1/private",
    );
    const changed: ZHighlight = {
      ...highlight,
      content: {
        version: 1,
        parts: [
          {
            type: "image",
            index: 0,
            src: "https://example.com/changed",
            alt: "Changed",
          },
        ],
      },
    };
    rerender(<Card value={changed} />);
    expect(container.querySelector("img")).toBeNull();
    fireEvent.click(getByRole("button"));
    expect(container.querySelector("img")).not.toBeNull();
    viewerId = "another-collaborator";
    rerender(<Card value={changed} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("waits for identity and automatically renders the author's own saved images", () => {
    viewerId = undefined;
    const { container, rerender } = render(<Card />);
    expect(container.querySelector("img")).toBeNull();
    viewerId = "author";
    rerender(<Card />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
