// Tailwind requires the color to be complete strings (can't be dynamic), so we have to list all the strings here manually.
export const HIGHLIGHT_COLOR_MAP = {
  // Matching Tailwind 200 colors for the CSS Custom Highlight API.
  css: {
    red: "#fecaca",
    green: "#bbf7d0",
    blue: "#bfdbfe",
    yellow: "#fef08a",
  } as const,
  bg: {
    red: "bg-red-200",
    green: "bg-green-200",
    blue: "bg-blue-200",
    yellow: "bg-yellow-200",
  } as const,
  ["border-l"]: {
    red: "border-l-red-200",
    green: "border-l-green-200",
    blue: "border-l-blue-200",
    yellow: "border-l-yellow-200",
  } as const,
};
