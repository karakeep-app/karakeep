"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { Sparkles } from "lucide-react";

/**
 * Tells a smart list apart from a manual one, as they can otherwise look the
 * same. It's an indicator rather than a control, and is safe to put in a link.
 * In a sidebar row it only takes the room the name leaves: an icon if that's too
 * little for the pill, and nothing at all if it's too little for that.
 */
export default function SmartListMarker({ query }: { query?: string | null }) {
  const { t } = useTranslation();
  const label = query
    ? `${t("lists.smart_list")}: ${query}`
    : t("lists.smart_list");
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className="inline-flex shrink-0 items-center"
        >
          <span className="rounded border border-border px-1 text-xs font-normal leading-4 text-muted-foreground [@container_sidebar-marker_(max-width:59px)]:hidden">
            {t("lists.smart_badge")}
          </span>
          <Sparkles
            aria-hidden
            className="hidden size-4 text-muted-foreground [@container_sidebar-marker_(min-width:22px)_and_(max-width:59px)]:block"
          />
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent className="max-w-xs break-words">
          {label}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
