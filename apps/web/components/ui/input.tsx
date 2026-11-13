import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  /**
   * "filled" has a tinted fill and no border until it's hovered or focused, for
   * an input that searches or filters a page. Form fields keep the default,
   * bordered look.
   */
  variant?: "default" | "filled";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, type, startIcon, endIcon, variant = "default", ...props },
    ref,
  ) => {
    return (
      <div className="relative w-full">
        {startIcon && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 transform">
            {startIcon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-4 py-2 text-base shadow-sm transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/85 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 dark:bg-accent/40 dark:aria-[invalid=true]:ring-destructive/40 max-sm:h-11 md:text-sm",
            variant === "filled" &&
              // Translucent so it shows on both a card and the panel, which the
              // muted colour doesn't: that's the panel's own colour in light mode.
              "border-transparent bg-border/70 shadow-none placeholder:text-muted-foreground hover:border-input focus-visible:bg-background dark:bg-border/70 dark:focus-visible:bg-background",
            startIcon ? "pl-8" : "",
            endIcon ? "pr-8" : "",
            className,
          )}
          ref={ref}
          {...props}
        />
        {endIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
            {endIcon}
          </div>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
