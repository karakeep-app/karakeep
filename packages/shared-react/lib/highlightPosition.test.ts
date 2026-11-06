// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  computeHighlightMenuPosition,
  getFixedPositionOffsetParent,
  toOffsetParentSpace,
} from "./highlightPosition";

/**
 * Builds a DOM subtree that mimics the preview modal:
 *
 *   body
 *     └─ dialog        (position: fixed; translate-x/y -> containing block)
 *          └─ content  (the element the highlighter renders into)
 *
 * `jsdom` does not implement layout, so `getBoundingClientRect` is stubbed
 * per element.
 */
const buildModalTree = (
  dialogRect: { left: number; top: number },
  contentRect: { left: number; top: number },
) => {
  const dialog = document.createElement("div");
  dialog.style.transform = "translate(-50%, -50%)";
  document.body.appendChild(dialog);

  const content = document.createElement("div");
  dialog.appendChild(content);

  dialog.getBoundingClientRect = () =>
    ({
      left: dialogRect.left,
      top: dialogRect.top,
      width: 800,
      height: 600,
      right: dialogRect.left + 800,
      bottom: dialogRect.top + 600,
      x: dialogRect.left,
      y: dialogRect.top,
      toJSON: () => ({}),
    }) as DOMRect;

  content.getBoundingClientRect = () =>
    ({
      left: contentRect.left,
      top: contentRect.top,
      width: 700,
      height: 500,
      right: contentRect.left + 700,
      bottom: contentRect.top + 500,
      x: contentRect.left,
      y: contentRect.top,
      toJSON: () => ({}),
    }) as DOMRect;

  return { dialog, content };
};

describe("getFixedPositionOffsetParent", () => {
  it("returns null when no ancestor establishes a containing block", () => {
    const content = document.createElement("div");
    document.body.appendChild(content);

    expect(getFixedPositionOffsetParent(content)).toBeNull();

    document.body.removeChild(content);
  });

  it("returns the closest transformed ancestor", () => {
    const { dialog, content } = buildModalTree(
      { left: 100, top: 50 },
      { left: 120, top: 80 },
    );

    expect(getFixedPositionOffsetParent(content)).toBe(dialog);

    document.body.removeChild(dialog);
  });

  it("returns the closest filtered ancestor", () => {
    const filtered = document.createElement("div");
    filtered.style.filter = "blur(2px)";
    document.body.appendChild(filtered);

    const content = document.createElement("div");
    filtered.appendChild(content);

    expect(getFixedPositionOffsetParent(content)).toBe(filtered);

    document.body.removeChild(filtered);
  });
});

describe("toOffsetParentSpace", () => {
  it("returns viewport coordinates when there is no offset parent", () => {
    const rect = { left: 100, top: 200, width: 50, height: 20 };

    expect(toOffsetParentSpace(rect, null)).toEqual({ x: 125, y: 200 });
  });

  it("converts viewport coordinates into the offset parent's space", () => {
    const { dialog, content } = buildModalTree(
      { left: 100, top: 50 },
      { left: 120, top: 80 },
    );

    const rect = { left: 300, top: 400, width: 50, height: 20 };

    // 300 - 100 = 200, + 25 (half the width) = 225
    // 400 - 50 = 350
    expect(toOffsetParentSpace(rect, dialog)).toEqual({ x: 225, y: 350 });

    document.body.removeChild(dialog);
    expect(content).toBeTruthy();
  });
});

describe("computeHighlightMenuPosition", () => {
  const selection = {
    left: 300,
    top: 400,
    width: 50,
    height: 20,
    bottom: 420,
  };

  it("anchors the popover above the selection on desktop", () => {
    const { dialog, content } = buildModalTree(
      { left: 100, top: 50 },
      { left: 120, top: 80 },
    );

    const position = computeHighlightMenuPosition(selection, dialog, false);

    // The anchor is expressed relative to the dialog, not the viewport.
    expect(position).toEqual({ x: 225, y: 350 });

    document.body.removeChild(dialog);
    expect(content).toBeTruthy();
  });

  it("anchors the popover below the selection on mobile", () => {
    const { dialog, content } = buildModalTree(
      { left: 100, top: 50 },
      { left: 120, top: 80 },
    );

    const position = computeHighlightMenuPosition(selection, dialog, true);

    expect(position).toEqual({ x: 225, y: 370 });

    document.body.removeChild(dialog);
    expect(content).toBeTruthy();
  });

  it("keeps viewport coordinates when the highlighter is not inside a transformed ancestor", () => {
    const content = document.createElement("div");
    document.body.appendChild(content);

    const position = computeHighlightMenuPosition(
      selection,
      getFixedPositionOffsetParent(content),
      false,
    );

    expect(position).toEqual({ x: 325, y: 400 });

    document.body.removeChild(content);
  });

  /**
   * The anchor is a `position: fixed` element, so the browser lays it out
   * against its containing block. This is the invariant that the fix has to
   * uphold: adding the anchor's offset back to the containing block's origin
   * must land on the selection again.
   *
   * With the old implementation (raw viewport coordinates) the anchor is
   * resolved against the dialog instead of the viewport, so it ends up offset
   * by the dialog's origin and the popover covers the selection.
   */
  it("resolves the anchor back onto the selection once the containing block offset is added", () => {
    const dialogOrigin = { left: 100, top: 50 };
    const { dialog, content } = buildModalTree(dialogOrigin, {
      left: 120,
      top: 80,
    });

    const position = computeHighlightMenuPosition(
      selection,
      getFixedPositionOffsetParent(content),
      false,
    );

    // Resolve the fixed anchor back into viewport coordinates.
    const resolved = {
      x: position.x + dialogOrigin.left,
      y: position.y + dialogOrigin.top,
    };

    expect(resolved.x).toBe(selection.left + selection.width / 2);
    expect(resolved.y).toBe(selection.top);

    document.body.removeChild(dialog);
  });

  it("would misplace the anchor if the viewport coordinates were used verbatim", () => {
    const dialogOrigin = { left: 100, top: 50 };
    const { dialog } = buildModalTree(dialogOrigin, {
      left: 120,
      top: 80,
    });

    // This is what the previous implementation did: it used the viewport
    // coordinates as if the containing block was the viewport.
    const legacy = {
      x: selection.left + selection.width / 2,
      y: selection.top,
    };

    const resolved = {
      x: legacy.x + dialogOrigin.left,
      y: legacy.y + dialogOrigin.top,
    };

    // The anchor is displaced by the dialog's origin, so it no longer sits on
    // the selection - this is the bug.
    expect(resolved.x).not.toBe(selection.left + selection.width / 2);
    expect(resolved.y).not.toBe(selection.top);
    expect(resolved.x - selection.left - selection.width / 2).toBe(
      dialogOrigin.left,
    );
    expect(resolved.y - selection.top).toBe(dialogOrigin.top);

    document.body.removeChild(dialog);
  });
});
