export { HIGHLIGHT_COLOR_MAP } from "@karakeep/shared-react/components/highlights";

const FLASH_DURATION_MS = 1800;

/**
 * Pulses a ring around a highlight's spans, to show where it landed.
 *
 * The highlighter replaces its spans whenever it redraws, which would drop an
 * animation started on the old ones, so this styles them by id for the duration.
 */
export function flashHighlight(highlightId: string) {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes karakeep-highlight-flash {
      0%, 50%, 100% { box-shadow: 0 0 0 0 hsl(var(--foreground)); }
      25%, 75% { box-shadow: 0 0 0 2px hsl(var(--foreground)); }
    }
    [data-highlight-id="${CSS.escape(highlightId)}"] {
      animation: karakeep-highlight-flash ${FLASH_DURATION_MS}ms ease-in-out;
    }
  `;
  document.head.appendChild(style);
  setTimeout(() => style.remove(), FLASH_DURATION_MS);
}
