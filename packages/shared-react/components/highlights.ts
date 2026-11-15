// Tailwind requires the color to be complete strings (can't be dynamic), so we have to list all the strings here manually.
export const HIGHLIGHT_COLOR_MAP = {
  // Painted behind article text, and sets that text's colour too, as a link's own
  // colour may not read on it. In dark mode the tints are strong enough to name.
  // Yellow's is amber, as a darkened yellow turns olive and a solid one glares.
  bg: {
    red: "bg-red-200 text-foreground dark:bg-red-500/50",
    green: "bg-green-200 text-foreground dark:bg-green-500/40",
    blue: "bg-blue-200 text-foreground dark:bg-blue-500/55",
    yellow: "bg-yellow-200 text-foreground dark:bg-amber-400/40",
  } as const,
  // Colour pickers and filters, which need to stand out on their own.
  swatch: {
    red: "bg-red-300 ring-1 ring-inset ring-red-600/50 dark:bg-red-400 dark:ring-red-200/50",
    green:
      "bg-green-300 ring-1 ring-inset ring-green-600/50 dark:bg-green-400 dark:ring-green-200/50",
    blue: "bg-blue-300 ring-1 ring-inset ring-blue-600/50 dark:bg-blue-400 dark:ring-blue-200/50",
    yellow:
      "bg-yellow-300 ring-1 ring-inset ring-yellow-600/50 dark:bg-yellow-300 dark:ring-yellow-100/50",
  } as const,
  ["border-l"]: {
    red: "border-l-red-300 dark:border-l-red-400",
    green: "border-l-green-300 dark:border-l-green-400",
    blue: "border-l-blue-300 dark:border-l-blue-400",
    yellow: "border-l-yellow-300 dark:border-l-yellow-300",
  } as const,
};
