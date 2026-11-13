import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";

/** A neutral icon control: 32px, or 44px on touch and at phone width. */
export const ICON_CONTROL_CLASS =
  "size-8 rounded-md text-muted-foreground hover:text-foreground max-sm:size-11 [@media(pointer:coarse)]:size-11";

/** Destructive icons stay neutral until hovered. */
export const DESTRUCTIVE_ICON_CONTROL_CLASS = "hover:text-destructive";

export function IconTooltip({
  label,
  side,
  children,
}: {
  label: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** Must accept a ref and spread props, as the tooltip trigger is its slot. */
  children: React.ReactNode;
}) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side={side}>{label}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

/** Names the action, as the icon doesn't, and then what it does. */
export function RestoreTooltip() {
  const { t } = useTranslation();
  return (
    <>
      <p>{t("actions.unarchive")}</p>
      <p className="opacity-80">{t("actions.unarchive_hint")}</p>
    </>
  );
}
