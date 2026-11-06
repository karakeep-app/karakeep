/**
 * Helpers for positioning the highlight popover's anchor.
 *
 * The anchor is rendered as a `position: fixed` element and is positioned with
 * viewport coordinates taken from `Range.getBoundingClientRect()`.
 *
 * A CSS `transform` on an ancestor (or on the ancestor itself) makes that
 * ancestor the *containing block* for `position: fixed` descendants. The
 * preview modal renders the highlighter inside `DialogContent`, which centers
 * itself with `translate-x-[-50%] translate-y-[-50%]`. As a result the anchor's
 * viewport coordinates are resolved against the dialog box instead of the
 * viewport, and the popover ends up covering the text selection.
 *
 * The helpers below find the ancestor that actually establishes the containing
 * block for the fixed anchor and convert the selection rect into that
 * ancestor's coordinate space.
 */

/**
 * Returns the element that acts as the containing block for `position: fixed`
 * descendants of `element`, or `null` when the containing block is the viewport.
 *
 * Mirrors the CSS containing block rules for transforms, filters and
 * backdrop-filters, and matches the rules that `@floating-ui/dom` uses to
 * resolve the offset parent of the anchor
 * (https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block).
 */
export const getFixedPositionOffsetParent = (
  element: HTMLElement | null,
): HTMLElement | null => {
  let current: HTMLElement | null = element?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    const hasTransform = [
      "transform",
      "translate",
      "scale",
      "rotate",
      "perspective",
    ].some((prop) => {
      const value = style[prop as never] as string | undefined;
      return value ? value !== "none" : false;
    });
    const hasFilter =
      (style.filter && style.filter !== "none") ||
      (style.backdropFilter && style.backdropFilter !== "none");
    const willChange = style.willChange ?? "";
    const hasWillChange = [
      "transform",
      "translate",
      "scale",
      "rotate",
      "perspective",
      "filter",
    ].some((prop) => willChange.includes(prop));
    const hasContain = ["paint", "layout", "strict", "content"].some((value) =>
      (style.contain ?? "").includes(value),
    );
    const hasContainerType =
      style.containerType && style.containerType !== "normal";

    if (
      hasTransform ||
      hasFilter ||
      hasWillChange ||
      hasContain ||
      hasContainerType
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

/**
 * Converts a viewport-relative rectangle into the coordinate space of
 * `offsetParent`.
 *
 * A `position: fixed` element is laid out against the padding box of its
 * containing block, so the border width (`clientLeft` / `clientTop`) has to be
 * accounted for. This mirrors how `@floating-ui/dom` converts the anchor rect
 * into offset-parent space.
 */
export const toOffsetParentSpace = (
  rect: { left: number; top: number; width: number },
  offsetParent: HTMLElement | null,
): { x: number; y: number } => {
  if (!offsetParent) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top,
    };
  }
  const parentRect = offsetParent.getBoundingClientRect();
  return {
    x: rect.left - (parentRect.left + offsetParent.clientLeft) + rect.width / 2,
    y: rect.top - (parentRect.top + offsetParent.clientTop),
  };
};

export interface HighlightMenuPosition {
  x: number;
  y: number;
}

/**
 * Computes the position of the highlight popover's anchor for a selection.
 *
 * On desktop the anchor sits above the selection, on mobile below it.
 *
 * @param selectionRect The bounding rect of the current text selection, in
 * viewport coordinates.
 * @param offsetParent The containing block that the fixed anchor resolves
 * against, or `null` for the viewport.
 * @param isMobile Whether the popover should be placed below the selection.
 */
export const computeHighlightMenuPosition = (
  selectionRect: {
    left: number;
    top: number;
    width: number;
    height: number;
    bottom: number;
  },
  offsetParent: HTMLElement | null,
  isMobile: boolean,
): HighlightMenuPosition => {
  const { x, y } = toOffsetParentSpace(selectionRect, offsetParent);
  return {
    x,
    y: isMobile ? y + selectionRect.height : y,
  };
};
