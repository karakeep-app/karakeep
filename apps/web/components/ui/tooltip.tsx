"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipPortal = TooltipPrimitive.Portal;

// Menus, selects and dialogs hand focus back to their trigger when they close, on
// Esc or Enter as much as on a click. Only these keys are the user moving focus
// themselves, which is when focus should open a tooltip.
const FOCUS_MOVING_KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);
const MODIFIER_KEYS = new Set(["Shift", "Meta", "Control", "Alt"]);

let lastInputMovedFocus = false;
// Pressing Esc on a menu opened with the mouse, or Enter in a dialog, is enough for
// the browser to treat focus returning to its trigger as :focus-visible. The ring
// is for those getting around by keyboard, so it stays off when they aren't, or
// when focus comes back to what they pressed, even after typing into a dialog.
let isNavigatingByPointer = false;
let lastPressedElement: Element | null = null;

/** Keeps the trigger's ring off, whichever utility classes are drawing it. */
function setFocusRingMuted(element: HTMLElement, muted: boolean) {
  if (muted) {
    element.style.setProperty("--tw-ring-shadow", "0 0 #0000", "important");
  } else {
    element.style.removeProperty("--tw-ring-shadow");
  }
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (e) => {
      lastInputMovedFocus = false;
      isNavigatingByPointer = true;
      // Not cleared by a press on anything else, such as a dialog's text field
      lastPressedElement =
        (e.target instanceof Element && e.target.closest("button, a")) ||
        lastPressedElement;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      // Modifiers alone, such as switching windows, aren't keyboard navigation
      if (MODIFIER_KEYS.has(e.key)) {
        return;
      }
      lastInputMovedFocus =
        FOCUS_MOVING_KEYS.has(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey;
      // Moving to a trigger, or pressing it, from the keyboard means focus
      // coming back to it later should show the ring, even if it was clicked once
      const pressesTrigger =
        (e.key === "Enter" || e.key === " ") &&
        e.target instanceof Element &&
        e.target.matches("button, a");
      if (lastInputMovedFocus || pressesTrigger) {
        isNavigatingByPointer = false;
        lastPressedElement = null;
      }
    },
    true,
  );
  document.addEventListener("focusin", (e) => {
    if (
      !lastInputMovedFocus &&
      (isNavigatingByPointer || e.target === lastPressedElement) &&
      e.target instanceof HTMLElement &&
      e.target.matches("button, a")
    ) {
      setFocusRingMuted(e.target, true);
    }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target instanceof HTMLElement) {
      setFocusRingMuted(e.target, false);
    }
  });
  // Keys pressed in an iframe or another window never reach this document, so
  // tabbing back in from one mustn't count as pointer navigation.
  window.addEventListener("blur", () => {
    isNavigatingByPointer = false;
  });
}

/**
 * Whether the trigger's menu, select, popover or dialog is open. aria-haspopup
 * tells these apart from a plain disclosure, which keeps its tooltip while open.
 */
function hasOpenOverlay(trigger: HTMLElement | null) {
  return !!trigger?.matches(
    '[aria-expanded="true"]:is([aria-haspopup], [role="combobox"])',
  );
}

const TooltipTriggerRefContext =
  React.createContext<React.RefObject<HTMLElement | null> | null>(null);

/** Stays out of the way while its trigger's own overlay is open. */
function Tooltip({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const triggerRef = React.useRef<HTMLElement>(null);
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = openProp ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (next && hasOpenOverlay(triggerRef.current)) {
      return;
    }
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const setOpenRef = React.useRef(setOpen);
  setOpenRef.current = setOpen;

  // Menus open on pointerdown and call preventDefault on it, which also skips
  // the primitive's own close on press, so the tooltip has to watch for them.
  React.useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (hasOpenOverlay(trigger)) {
        setOpenRef.current(false);
      }
    });
    observer.observe(trigger, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
    return () => observer.disconnect();
  }, [open]);

  return (
    <TooltipTriggerRefContext.Provider value={triggerRef}>
      <TooltipPrimitive.Root {...props} open={open} onOpenChange={setOpen} />
    </TooltipTriggerRefContext.Provider>
  );
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onFocus, ...props }, forwardedRef) => {
  const triggerRef = React.useContext(TooltipTriggerRefContext);
  const ref = React.useCallback(
    (element: HTMLButtonElement | null) => {
      if (triggerRef) {
        triggerRef.current = element;
      }
      if (typeof forwardedRef === "function") {
        forwardedRef(element);
      } else if (forwardedRef) {
        forwardedRef.current = element;
      }
    },
    [triggerRef, forwardedRef],
  );
  return (
    <TooltipPrimitive.Trigger
      {...props}
      ref={ref}
      onFocus={(e) => {
        onFocus?.(e);
        if (!lastInputMovedFocus) {
          // The primitive skips opening on focus when this is prevented.
          e.preventDefault();
        }
      }}
    />
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 0, children, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 w-fit origin-[--radix-tooltip-content-transform-origin] text-balance rounded-md bg-foreground px-3 py-1.5 text-xs text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  >
    {children}
    <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
  </TooltipPrimitive.Content>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TooltipPortal,
};
