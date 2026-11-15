"use client";

import Link from "next/link";
import { CARD_META_CLASS } from "@/components/dashboard/bookmarks/icons";
import KarakeepLogo from "@/components/KarakeepIcon";
import { ButtonWithTooltip } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { RssIcon } from "lucide-react";

export default function PublicListHeader({
  list,
}: {
  list: {
    id: string;
    name: string;
    description: string | null | undefined;
    icon: string;
    ownerName: string;
    numItems: number;
  };
}) {
  const { t } = useTranslation();
  const rssLink = `/api/v1/rss/lists/${list.id}`;
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6 max-sm:p-4">
      <KarakeepLogo height={38} />
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="text-3xl leading-tight">
          {list.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-2xl font-semibold leading-tight text-foreground">
            {list.name}
          </h1>
          {list.description && list.description.length > 0 && (
            <p className="mt-1 text-muted-foreground">{list.description}</p>
          )}
        </div>
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-1.5 gap-y-1",
          CARD_META_CLASS,
        )}
      >
        <span>
          {t("public_lists.created_by")}{" "}
          <span className="font-medium text-foreground">{list.ownerName}</span>
        </span>
        <span aria-hidden>•</span>
        <span>
          {t("public_lists.bookmark_count", { count: list.numItems })}
        </span>
        <ButtonWithTooltip
          asChild
          tooltip={t("public_lists.rss_feed")}
          delayDuration={300}
          aria-label={t("public_lists.rss_feed")}
          variant="ghost"
          size="none"
          className="ml-auto size-8 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] max-sm:size-11 [@media(pointer:coarse)]:size-11"
        >
          <Link href={rssLink} target="_blank">
            <RssIcon className="size-4" />
          </Link>
        </ButtonWithTooltip>
      </div>
    </div>
  );
}
