import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "../../utils/css";

interface DynamicPopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /**
   * Whether to enable dynamic height adjustment
   * If true, use max-h when content can fit the viewport, otherwise use fixed height
   * If false, always use h-[var(--radix-popover-content-available-height)]
   */
  dynamicHeight?: boolean;

  /**
   * Debounce delay for height adjustment (milliseconds)
   * Used to optimize performance and avoid frequent recalculations
   */
  debounceMs?: number;
}

/**
 * Custom Hook for debouncing
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Utility function to get available height
 */
function getAvailableHeight(element: HTMLElement): number {
  try {
    const cssValue = getComputedStyle(element).getPropertyValue(
      "--radix-popover-content-available-height",
    );

    const parsedValue = parseInt(cssValue, 10);

    // If CSS variable value cannot be obtained, fallback to 80% of viewport height
    return !isNaN(parsedValue) && parsedValue > 0
      ? parsedValue
      : Math.floor(window.innerHeight * 0.8);
  } catch (error) {
    console.warn("Failed to get available height from CSS variable:", error);
    return Math.floor(window.innerHeight * 0.8);
  }
}

/**
 * Utility function to calculate content height
 */
function getContentHeight(element: HTMLElement): number {
  try {
    return element.scrollHeight;
  } catch (error) {
    console.warn("Failed to get content height:", error);
    return 0;
  }
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
      debounceMs = 100,
      children,
      ...props
    },
    ref,
  ) => {
    const contentRef = React.useRef<HTMLDivElement>(null);

    // Use state to manage height class name
    const [heightClass, setHeightClass] = React.useState<string>(
      "max-h-[var(--radix-popover-content-available-height)]",
    );

    // Create a dependency to trigger recalculation
    const [childrenKey, setChildrenKey] = React.useState(0);

    // Use debounce to optimize performance
    const debouncedChildrenKey = useDebounce(childrenKey, debounceMs);

    // Listen for children changes
    React.useEffect(() => {
      setChildrenKey((prev) => prev + 1);
    }, [children]);

    // Utility function to merge refs
    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        // Set internal ref
        contentRef.current = node;

        // Set external ref
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    // Core logic for calculating height
    const calculateHeight = React.useCallback(() => {
      if (!dynamicHeight || !contentRef.current) {
        return;
      }

      const element = contentRef.current;
      const availableHeight = getAvailableHeight(element);
      const contentHeight = getContentHeight(element);

      // Add some buffer to avoid edge cases
      const BUFFER = 10;

      if (contentHeight + BUFFER > availableHeight) {
        setHeightClass("h-[var(--radix-popover-content-available-height)]");
      } else {
        setHeightClass("max-h-[var(--radix-popover-content-available-height)]");
      }
    }, [dynamicHeight]);

    // Use useLayoutEffect to avoid layout flickering
    React.useLayoutEffect(() => {
      calculateHeight();
    }, [calculateHeight, debouncedChildrenKey]);

    // Handle window resize
    React.useEffect(() => {
      if (!dynamicHeight) return;

      const handleResize = () => {
        calculateHeight();
      };

      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, [calculateHeight, dynamicHeight]);

    // Define all styles as a single constant for better performance and simplicity
    const POPOVER_STYLES =
      "z-50 w-72 overflow-y-auto rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

    // Determine final height class name
    const finalHeightClass = React.useMemo(() => {
      return dynamicHeight
        ? heightClass
        : "h-[var(--radix-popover-content-available-height)]";
    }, [dynamicHeight, heightClass]);

    // Memoize the complete class name for performance
    const popoverClassName = React.useMemo(
      () => cn(POPOVER_STYLES, finalHeightClass, className),
      [finalHeightClass, className],
    );

    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={setRefs}
          align={align}
          sideOffset={sideOffset}
          className={popoverClassName}
          {...props}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    );
  },
);

DynamicPopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { DynamicPopoverContent };
