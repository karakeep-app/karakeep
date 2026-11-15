import * as React from "react";
import { cn } from "@/lib/utils";

import type { TextareaProps } from "@karakeep/shared-react/components/ui/textarea";
import { Textarea as SharedTextarea } from "@karakeep/shared-react/components/ui/textarea";

export type { TextareaProps };

/** Placeholders stay one step lighter than real muted text, as in `Input`. */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <SharedTextarea
      ref={ref}
      className={cn("placeholder:text-muted-foreground/85", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
