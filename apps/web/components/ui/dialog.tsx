"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Where focus goes back to when a dialog closes. A dialog opened from a menu
 * item gets the menu's trigger, as the item is gone by then.
 */
function focusReturnTarget() {
  let element = document.activeElement;
  let menu = element?.closest('[role="menu"]');
  while (menu?.id) {
    element = document.querySelector(
      `[aria-controls="${CSS.escape(menu.id)}"]`,
    );
    menu = element?.closest('[role="menu"]');
  }
  // Safari doesn't focus a pressed button, which leaves the body, and then
  // Radix's own return to a DialogTrigger is the better choice.
  return element instanceof HTMLElement && element !== document.body
    ? element
    : null;
}

/**
 * Never taller than the viewport. A dialog that can grow wraps its fields in
 * `DialogBody`, so the title and actions stay in view while the fields scroll,
 * and with one of those the shell itself never scrolls. A form spanning all three
 * uses `className="contents"` to stay out of the layout. `sheetOnPhone` fills the
 * screen at phone width, for an editor that needs all of it. There are two widths:
 * `sm`, 480px, for confirmations and short forms, and `lg`, 640px, for complex ones.
 * On closing, focus goes back to whatever had it on opening, or the trigger of
 * the menu it was opened from. Radix only does that for a `DialogTrigger`, and a
 * dialog opened from a row's menu doesn't have one.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideCloseBtn?: boolean;
    sheetOnPhone?: boolean;
    size?: "sm" | "lg";
  }
>(
  (
    {
      className,
      children,
      hideCloseBtn = false,
      sheetOnPhone = false,
      size = "sm",
      onOpenAutoFocus,
      onCloseAutoFocus,
      onInteractOutside,
      ...props
    },
    ref,
  ) => {
    const openedFrom = React.useRef<HTMLElement | null>(null);
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          onOpenAutoFocus={(event) => {
            openedFrom.current = focusReturnTarget();
            onOpenAutoFocus?.(event);
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (!event.defaultPrevented && openedFrom.current?.isConnected) {
              event.preventDefault();
              openedFrom.current.focus({ preventScroll: true });
            }
          }}
          onInteractOutside={(event) => {
            onInteractOutside?.(event);
            // A toast's action, like Undo, is outside the dialog but shouldn't close it
            if (
              event.target instanceof Element &&
              event.target.closest("[data-sonner-toaster]")
            ) {
              event.preventDefault();
            }
          }}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-2xl duration-150 has-[[data-dialog-body]]:overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-1/2",
            size === "lg" ? "max-w-[640px]" : "max-w-[480px]",
            // One that sets its own height, like the full-screen preview, lays out
            // its own content in that height.
            /(^|\s)([a-z-]+:)?h-/.test(className ?? "")
              ? "grid"
              : "flex max-h-[calc(100dvh-2rem)] flex-col",
            sheetOnPhone &&
              "max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-top-0 max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-top-0",
            className,
          )}
          {...props}
        >
          {children}
          {!hideCloseBtn && (
            <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none max-sm:right-1.5 max-sm:top-1.5 max-sm:size-11">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col gap-1.5 text-center sm:pr-8 sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

/**
 * The one scrolling region of a tall dialog, between its header and footer. It's
 * positioned so the hidden native inputs of radios and selects, which are
 * absolutely placed, stay inside it. Unpositioned, they'd count towards the
 * overflow of the shell around it and make that scroll as well.
 */
const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-dialog-body=""
    className={cn(
      // The padding keeps focus rings from clipping against the scroll edges.
      "relative -mx-6 -my-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1",
      className,
    )}
    {...props}
  />
);
DialogBody.displayName = "DialogBody";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold leading-snug", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
