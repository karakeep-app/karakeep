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
 * row's own click handler navigates — unless the click should not count as
 * "open this bookmark". Ctrl/Cmd-click and middle-click still open in a new
 * tab, the same as clicking a real link would.
 */
/**
 * Whether a click that reached the row should be ignored rather than treated
 * as "open this bookmark". Exported for testing.
 *
 * Three cases, all of which must not navigate:
 *
 * 1. **Portaled content.** The row renders an overflow menu whose Edit and
 *    Delete dialogs are Radix portals: in the DOM they live under `<body>`,
 *    but they are still React children of the row, and React synthetic
 *    events bubble through the *React* tree rather than the DOM tree. A
 *    click on a dialog's padding or its backdrop therefore arrives here
 *    with no `a`/`button` ancestor and no text selection, and would
 *    navigate away — closing the dialog mid-edit. `currentTarget.contains`
 *    is the DOM-ancestry check that catches exactly this: portaled content
 *    fails it, every genuine in-row click passes.
 * 2. **Interactive descendants.** Tags, the favourite button and the
 *    overflow trigger handle their own clicks; the row must not also
 *    navigate on top of them.
 * 3. **Text selection.** The mouse-up ending a drag-selection is still a
 *    click; treating it as one would make the text unselectable in
 *    practice, which is the whole point of this hook.
 */
export function shouldIgnoreRowClick(
  currentTarget: HTMLElement,
  target: Node,
  hasSelection: boolean,
): boolean {
  if (!currentTarget.contains(target)) return true;
  if ((target as HTMLElement).closest?.("a, button")) return true;
  return hasSelection;
}

export function useRowNavigate(href: string) {
  const router = useRouter();

  const shouldIgnore = (e: React.MouseEvent<HTMLElement>) =>
    shouldIgnoreRowClick(
      e.currentTarget,
      e.target as Node,
      (window.getSelection()?.toString().length ?? 0) > 0,
    );

  return {
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (shouldIgnore(e)) return;
      if (e.metaKey || e.ctrlKey) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(href);
    },
    onAuxClick: (e: React.MouseEvent<HTMLElement>) => {
      // Middle click doesn't fire onClick; browsers report it as auxclick.
      if (e.button !== 1) return;
      if (shouldIgnore(e)) return;
      window.open(href, "_blank", "noopener,noreferrer");
    },
  };
}
