"use client";

import { useRouter } from "next/navigation";

/**
 * Click-to-open for a list row / grid card, without the tradeoff the
 * previous approach made.
 *
 * The row used to be covered by an absolutely positioned `<Link>` with the
 * actual content set to `pointer-events: none` so clicks would fall
 * through to it — that made the whole row clickable, at the cost of the
 * title and summary being impossible to select or copy, because elements
 * under `pointer-events: none` don't receive the mouse events selection
 * relies on.
 *
 * This does the opposite: content keeps normal pointer events, and the
 * row's own click handler navigates — unless the click landed on an
 * interactive descendant (a tag, the favourite button, the overflow menu;
 * those handle themselves) or the user just finished dragging out a text
 * selection. Ctrl/Cmd-click and middle-click still open in a new tab, the
 * same as clicking a real link would.
 */
export function useRowNavigate(href: string) {
  const router = useRouter();

  const isInteractiveTarget = (e: React.MouseEvent<HTMLElement>) =>
    (e.target as HTMLElement).closest("a, button") !== null;

  const hasActiveSelection = () =>
    (window.getSelection()?.toString().length ?? 0) > 0;

  return {
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (isInteractiveTarget(e) || hasActiveSelection()) {
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(href);
    },
    onAuxClick: (e: React.MouseEvent<HTMLElement>) => {
      // Middle click doesn't fire onClick; browsers report it as auxclick.
      if (e.button !== 1) return;
      if (isInteractiveTarget(e) || hasActiveSelection()) {
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
    },
  };
}
