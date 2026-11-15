import type { LayoutChangeEvent } from "react-native";
import { useState } from "react";
import { Platform, useWindowDimensions } from "react-native";

// Max width for single-column content (lists, forms, reading) so that rows
// and lines don't stretch across the whole screen on tablets.
export const READABLE_CONTENT_MAX_WIDTH = 720;

export const SIDEBAR_WIDTH = 260;
// Narrower windows (phones, iPhone Duo folded or in Split View) don't leave
// enough room next to the sidebar, so they keep the tab bar instead.
const SIDEBAR_MIN_WINDOW_WIDTH = 800;

/**
 * Whether the dashboard shows its sidebar instead of the tab bar. Reads the
 * window size on every render, so folding or resizing switches between them.
 */
export function useShowSidebar() {
  const { width } = useWindowDimensions();
  return Platform.OS === "ios" && width >= SIDEBAR_MIN_WINDOW_WIDTH;
}

/**
 * Tracks the width of a container through its `onLayout`. Until the first
 * layout, it falls back to the window width, which is right for full-screen
 * views. Measuring matters for views shown in iPad form sheets or split view,
 * where the container is narrower than the window.
 *
 * Put `onLayout` on a plain View wrapping a list, not on the FlatList itself:
 * FlatList also forwards its `ListEmptyComponent`'s layout to `onLayout`,
 * which would report the empty state's width instead of the list's.
 */
export function useContainerWidth() {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    setMeasuredWidth(e.nativeEvent.layout.width);
  };

  return { width: measuredWidth ?? windowWidth, onLayout };
}

/**
 * Splits the container (minus `horizontalInset` on each side) into as many
 * columns as fit without any of them getting narrower than `minColumnWidth`.
 * Phones get a single column; tablets get a grid.
 */
export function getGridColumns({
  containerWidth,
  horizontalInset,
  gap,
  minColumnWidth,
  maxColumns = 4,
}: {
  containerWidth: number;
  horizontalInset: number;
  gap: number;
  minColumnWidth: number;
  maxColumns?: number;
}) {
  const availableWidth = containerWidth - horizontalInset * 2;
  const numColumns = Math.max(
    1,
    Math.min(
      maxColumns,
      Math.floor((availableWidth + gap) / (minColumnWidth + gap)),
    ),
  );
  const columnWidth = (availableWidth - gap * (numColumns - 1)) / numColumns;
  return { numColumns, columnWidth };
}
