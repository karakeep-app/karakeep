// Tailwind requires the color to be complete strings (can't be dynamic), so we have to list all the strings here manually.
export const HIGHLIGHT_COLOR_MAP = {
  bg: {
    red: { light: "bg-red-200", dark: "bg-red-500" },
    green: { light: "bg-green-200", dark: "bg-green-500" },
    blue: { light: "bg-blue-200", dark: "bg-blue-500" },
    yellow: { light: "bg-yellow-200", dark: "bg-yellow-500" },
  } as const,
  ["border-l"]: {
    red: "border-l-red-200",
    green: "border-l-green-200",
    blue: "border-l-blue-200",
    yellow: "border-l-yellow-200",
  } as const,
};
