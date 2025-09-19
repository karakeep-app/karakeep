import React from "react";
import { useClientConfig } from "@/lib/clientConfig";

import type { ButtonProps } from "./button";
import { Button } from "./button";
import LoadingSpinner from "./spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "./tooltip";

interface ActionButtonProps extends ButtonProps {
  loading: boolean;
  spinner?: React.ReactNode;
  ignoreDemoMode?: boolean;
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    { children, loading, spinner, disabled, ignoreDemoMode = false, ...props },
    ref,
  ) => {
    const clientConfig = useClientConfig();
    spinner ||= <LoadingSpinner />;
    if (!ignoreDemoMode && clientConfig.demoMode) {
      disabled = true;
    } else if (disabled !== undefined) {
      disabled ||= loading;
    } else if (loading) {
      disabled = true;
    }
    return (
      <Button ref={ref} {...props} disabled={disabled}>
        {loading ? spinner : children}
      </Button>
    );
  },
);
ActionButton.displayName = "ActionButton";

const ActionButtonWithTooltip = React.forwardRef<
  HTMLButtonElement,
  ActionButtonProps & { tooltip: string; delayDuration?: number }
>(({ tooltip, delayDuration, ...props }, ref) => {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>
        <ActionButton ref={ref} {...props} />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{tooltip}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
});
ActionButtonWithTooltip.displayName = "ActionButtonWithTooltip";

export { ActionButton, ActionButtonWithTooltip };
export type { ActionButtonProps };
