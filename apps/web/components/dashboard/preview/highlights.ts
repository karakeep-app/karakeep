// Tailwind requires the color to be complete strings (can't be dynamic), so we have to list all the strings here manually.
export const HIGHLIGHT_COLOR_MAP = {
  bg: {
    red: { light: "bg-red-200", dark: "bg-red-500" },
    green: { light: "bg-green-200", dark: "bg-green-500" },
    blue: { light: "bg-blue-200", dark: "bg-blue-500" },
    yellow: { light: "bg-yellow-200", dark: "bg-yellow-600" },
  } as const,
  ["border-l"]: {
    red: "border-l-red-200",
    green: "border-l-green-200",
    blue: "border-l-blue-200",
    yellow: "border-l-yellow-200",
  } as const,
  img: {
    red: "hue-rotate(-30deg) saturate(1.5) brightness(0.9)",
    green: "hue-rotate(60deg) saturate(1.3) brightness(0.9)",
    blue: "hue-rotate(180deg) saturate(1.2) brightness(0.9)",
    yellow: "hue-rotate(30deg) saturate(1.4) brightness(0.9)",
  } as const,
};
