// Tailwind requires the color to be complete strings (can't be dynamic), so we have to list all the strings here manually.
export const HIGHLIGHT_COLOR_MAP = {
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
  // Images cannot be wrapped in a text span, so use an outline to show that
  // they are part of a highlight range.
  img: {
    red: "outline outline-4 outline-red-300 outline-offset-2",
    green: "outline outline-4 outline-green-300 outline-offset-2",
    blue: "outline outline-4 outline-blue-300 outline-offset-2",
    yellow: "outline outline-4 outline-yellow-300 outline-offset-2",
  } as const,
};
