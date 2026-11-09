"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipPortal = TooltipPrimitive.Portal;

const Tooltip = TooltipPrimitive.Root;

/**
 * Opens on focus only when the user moved focus here, from another element.
 * Radix opens it on any focus that doesn't come from pressing the trigger, which
 * includes a menu, popover or dialog handing focus back once it has closed.
 * Those focus the trigger after their content has left the page, so focus comes
 * from nowhere. `:focus-visible` can't tell the two apart after a menu: its
 * trigger cancels the pointer press, so the browser never sees the mouse in use.
 */
const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onFocus, ...props }, ref) => (
  <TooltipPrimitive.Trigger
    {...props}
    ref={ref}
    onFocus={(e) => {
      onFocus?.(e);
      if (e.relatedTarget === null) {
        // The primitive skips opening on focus when this is prevented.
        e.preventDefault();
      }
    }}
  />
));
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
