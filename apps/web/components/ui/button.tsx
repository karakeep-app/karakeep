import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "./tooltip";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        none: "",
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        destructiveOutline:
          "border border-destructive bg-transparent text-destructive hover:bg-destructive/90 hover:text-destructive-foreground",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground focus-visible:ring-0 focus-visible:ring-offset-0",
        border: "border border-input hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        none: "",
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

const ButtonWithTooltip = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & { tooltip: string; delayDuration?: number }
>(({ tooltip, delayDuration, ...props }, ref) => {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>
        <Button ref={ref} {...props} />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{tooltip}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
});
ButtonWithTooltip.displayName = "ButtonWithTooltip";

export { Button, buttonVariants, ButtonWithTooltip };
