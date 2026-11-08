export { HIGHLIGHT_COLOR_MAP } from "@karakeep/shared-react/components/highlights";

/** Pulses a ring around a highlight's spans, to show where it landed. */
export function flashHighlight(spans: Element[]) {
  const ring = "0 0 0 2px hsl(var(--foreground))";
  const none = "0 0 0 0 hsl(var(--foreground))";
  for (const span of spans) {
    span.animate(
      { boxShadow: [none, ring, none, ring, none] },
      { duration: 1800, easing: "ease-in-out" },
    );
  }
}
