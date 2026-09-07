import * as React from "react";

import type { ButtonProps } from "@karakeep/shared-react/components/ui/button";
import { Button } from "@karakeep/shared-react/components/ui/button";

import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "./tooltip";

export {
  Button,
  buttonVariants,
  type ButtonProps,
} from "@karakeep/shared-react/components/ui/button";

const ButtonWithTooltip = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & { tooltip: string; delayDuration?: number }
>(({ tooltip, delayDuration, ...props }, ref) => {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger
        asChild
        onFocus={(event) => {
          // Menus restore focus to their trigger after a pointer selection.
          // Keep that focus, but only show focus-triggered tooltips for keyboard users.
          if (!event.currentTarget.matches(":focus-visible")) {
            event.preventDefault();
          }
        }}
      >
        <Button ref={ref} {...props} />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{tooltip}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
});
ButtonWithTooltip.displayName = "ButtonWithTooltip";

export { ButtonWithTooltip };
