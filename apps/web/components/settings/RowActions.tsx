"use client";

import * as React from "react";
import Link from "next/link";
import type { ButtonProps } from "@/components/ui/button";
import { Button, ButtonWithTooltip } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";

const iconClass = "text-muted-foreground max-sm:size-11";

/**
 * Labelled delete controls read as destructive before you hover them. Goes on a
 * `variant="outline"` button, ghost buttons have `variant="ghostDestructive"`.
 */
export const destructiveTextClass =
  "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20";
const destructiveHoverClass =
  "hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive dark:hover:bg-destructive/20";

/**
 * A neutral ghost icon for table and list rows. Red only appears on hover of
 * destructive actions, the confirmation dialog carries the actual warning.
 */
export const RowIconButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & {
    label: string;
    destructive?: boolean;
    /** Shown as the tooltip while disabled, since disabled buttons can't hover. */
    disabledReason?: string;
  }
>(({ label, destructive, disabledReason, className, ...props }, ref) => {
  const classes = cn(
    iconClass,
    destructive && destructiveHoverClass,
    className,
  );
  if (props.disabled && disabledReason) {
    // Only marked as disabled, as a disabled button can't be hovered or focused
    // and the reason would be out of reach.
    const { disabled: _disabled, onClick: _onClick, ...rest } = props;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            aria-label={label}
            aria-disabled
            variant="ghost"
            size="icon-sm"
            className={cn(
              classes,
              "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
            )}
            {...rest}
          />
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{disabledReason}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    );
  }
  return (
    <ButtonWithTooltip
      ref={ref}
      tooltip={label}
      aria-label={label}
      variant="ghost"
      size="icon-sm"
      className={classes}
      {...props}
    />
  );
});
RowIconButton.displayName = "RowIconButton";

export interface RowMenuItem {
  label: string;
  icon?: React.ReactNode;
  /** A second line under the label, such as why the item is disabled. */
  description?: string;
  /** Starts a new group of items in the menu, under this heading. */
  heading?: React.ReactNode;
  /** Receives the menu button, so dialogs can return focus to it on close. */
  onSelect?: (trigger: HTMLElement) => void;
  href?: string;
  external?: boolean;
  download?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}

/**
 * The one way to act on a row, at every width: a labelled "…" menu. At most one
 * common action may sit beside it, as a labelled button of its own.
 */
export function RowActionsMenu({
  items,
  label,
  disabledReason,
  className,
}: {
  items: RowMenuItem[];
  label?: string;
  /** Disables the whole menu, and says why in the tooltip, even with no items. */
  disabledReason?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // Runs once the menu has closed and focus is back on the button, so a dialog
  // opened from the menu returns focus there too, rather than to the page.
  const pendingAction = React.useRef<(() => void) | null>(null);
  const accessibleLabel = label ?? t("common.actions");
  if (disabledReason) {
    return (
      <RowIconButton
        label={accessibleLabel}
        disabled
        disabledReason={disabledReason}
        className={className}
      >
        <MoreHorizontal className="size-4" />
      </RowIconButton>
    );
  }
  if (items.length === 0) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ButtonWithTooltip
          ref={triggerRef}
          tooltip={t("common.actions")}
          variant="ghost"
          size="icon-sm"
          aria-label={accessibleLabel}
          className={cn(iconClass, className)}
        >
          <MoreHorizontal className="size-4" />
        </ButtonWithTooltip>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-w-80"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
          pendingAction.current?.();
          pendingAction.current = null;
        }}
      >
        {items.map((item, index) => {
          const variant = item.destructive ? "destructive" : "default";
          const heading = item.heading && (
            <React.Fragment key={`${item.label}-heading`}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                {item.heading}
              </DropdownMenuLabel>
            </React.Fragment>
          );
          return item.href ? (
            <DropdownMenuItem
              key={item.label}
              asChild
              disabled={item.disabled}
              variant={variant}
              className="max-sm:min-h-11"
            >
              <Link
                href={item.href}
                prefetch={false}
                download={item.download}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
              >
                {item.icon}
                {item.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <React.Fragment key={item.label}>
              {heading}
              <DropdownMenuItem
                disabled={item.disabled}
                variant={variant}
                className="max-sm:min-h-11"
                onSelect={() => {
                  pendingAction.current = () => {
                    if (triggerRef.current) {
                      item.onSelect?.(triggerRef.current);
                    }
                  };
                }}
              >
                {item.icon}
                {item.description ? (
                  <span className="flex flex-col">
                    {item.label}
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                ) : (
                  item.label
                )}
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
