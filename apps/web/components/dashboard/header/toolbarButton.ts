// The header's Filter, View and Sort buttons: icons below 1024px, labelled above.
export const TOOLBAR_BUTTON_CLASS =
  "relative h-9 w-9 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] max-sm:h-11 max-sm:w-11 lg:w-auto lg:px-2.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:lg:w-auto";

// What a phone gets instead of a long menu: a sheet along the bottom of the screen
export const BOTTOM_SHEET_CLASS =
  "bottom-0 left-0 top-auto max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 gap-0 rounded-b-none px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-3 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0";

// Marks a control that's set to something other than its default
export const TOOLBAR_DOT_CLASS = "size-1.5 shrink-0 rounded-full bg-primary";
