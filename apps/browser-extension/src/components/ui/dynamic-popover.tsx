import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "../../utils/css";

interface DynamicPopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /**
   * If true, will use max-h when content fits in viewport, otherwise h
   * If false, will always use h-[var(--radix-popover-content-available-height)]
   */
  dynamicHeight?: boolean;
}

const DynamicPopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  DynamicPopoverContentProps
>(
  (
    {
      className,
      align = "center",
      sideOffset = 4,
      dynamicHeight = true,
      ...props
    },
    ref,
  ) => {
    const contentRef = React.useRef<HTMLDivElement>(null);
    const [heightClass, setHeightClass] = React.useState<string>(
      "max-h-[var(--radix-popover-content-available-height)]",
    );

    React.useLayoutEffect(() => {
      if (!dynamicHeight || !contentRef.current) return;

      // Get the available height from CSS variable provided by Radix UI
      const availableHeight =
        parseInt(
          getComputedStyle(contentRef.current).getPropertyValue(
            "--radix-popover-content-available-height",
          ),
        ) || window.innerHeight;

      // Measure the content height
      const contentHeight = contentRef.current.scrollHeight;

      // If content height exceeds available height, use fixed height
      // Otherwise, use max-height to allow natural sizing
      if (contentHeight > availableHeight) {
        setHeightClass("h-[var(--radix-popover-content-available-height)]");
      }
    }, [dynamicHeight, props.children]);

    // If dynamicHeight is false, use the original behavior
    const heightClasses = dynamicHeight
      ? heightClass
      : "h-[var(--radix-popover-content-available-height)]";

    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={(node) => {
            if (typeof ref === "function") {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
            contentRef.current = node;
          }}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            "z-50 w-72 overflow-y-auto rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out  data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            heightClasses,
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Portal>
    );
  },
);
DynamicPopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { DynamicPopoverContent };
