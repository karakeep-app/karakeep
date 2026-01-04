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
  icon?: React.ReactNode;
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      children,
      loading,
      spinner,
      disabled,
      ignoreDemoMode = false,
      icon,
      ...props
    },
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

    // Determine button content based on loading state and icon prop
    let content;
    if (icon) {
      // If icon is provided, show spinner instead of icon when loading, keep text
      content = (
        <>
          {loading ? spinner : icon}
          {children}
        </>
      );
    } else {
      // Fallback to old behavior: replace entire content with spinner when loading
      content = loading ? spinner : children;
    }

    return (
      <Button ref={ref} {...props} disabled={disabled}>
        {content}
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
