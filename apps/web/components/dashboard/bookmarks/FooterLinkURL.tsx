"use client";

import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { ExternalLink } from "lucide-react";

export function getDisplayDomain(url: string) {
  return new URL(url).host.replace(/^www\./, "");
}

export default function FooterLinkURL({ url }: { url: string | null }) {
  const { t } = useTranslation();
  if (!url) {
    return null;
  }
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Link
          // 44px on phones. The row it's in is that tall anyway, so nothing moves.
          className="flex min-w-0 max-w-full items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:h-11"
          href={url}
          target="_blank"
          rel="noreferrer"
          // A card's tab stops are its title and its menu
          tabIndex={-1}
        >
          <span className="truncate">{getDisplayDomain(url)}</span>
          <ExternalLink aria-hidden className="size-3 shrink-0 opacity-60" />
        </Link>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{t("actions.open_original")}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
