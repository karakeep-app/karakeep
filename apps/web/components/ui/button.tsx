import * as React from "react";
import { cn } from "@/lib/utils";

import type { ButtonProps } from "@karakeep/shared-react/components/ui/button";
import { Button as BaseButton } from "@karakeep/shared-react/components/ui/button";

import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "./tooltip";

export {
  buttonVariants,
  type ButtonProps,
} from "@karakeep/shared-react/components/ui/button";

// Filled buttons keep their own fill while disabled, so they read as the same
// button but unavailable. Pointer events are still off through the base class.
const FADED_WHEN_DISABLED = "disabled:opacity-40";

const FILLED_VARIANTS: ButtonProps["variant"][] = [
  "default",
  "secondary",
  "destructive",
];

// Touch-sized targets at phone width. size="none" callers set their own.
const PHONE_SIZE: Partial<Record<NonNullable<ButtonProps["size"]>, string>> = {
  default: "max-sm:h-11",
  sm: "max-sm:h-11",
  icon: "max-sm:size-11",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", className, ...props }, ref) => (
    <BaseButton
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        FILLED_VARIANTS.includes(variant) && FADED_WHEN_DISABLED,
        size && PHONE_SIZE[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

const ButtonWithTooltip = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & {
    tooltip: string;
    delayDuration?: number;
    // The key that does the same, shown after the tooltip's text
    shortcut?: string;
  }
>(({ tooltip, delayDuration, shortcut, ...props }, ref) => {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>
        <Button ref={ref} {...props} />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>
          {tooltip}
          {shortcut && <span className="ml-2 opacity-70">{shortcut}</span>}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
});
ButtonWithTooltip.displayName = "ButtonWithTooltip";

export { Button, ButtonWithTooltip };
