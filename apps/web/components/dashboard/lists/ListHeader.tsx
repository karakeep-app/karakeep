"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "@/lib/i18n/client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Globe, Lock, MoreHorizontal, Sparkles, Users } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

import QueryExplainerTooltip from "../search/QueryExplainerTooltip";
import { ListOptions } from "./ListOptions";

export default function ListHeader({
  initialData,
}: {
  initialData: ZBookmarkList;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const router = useRouter();
  const { data: list, error } = useQuery(
    api.lists.get.queryOptions(
      {
        listId: initialData.id,
      },
      {
        initialData,
      },
    ),
  );

  const { data: collaboratorsData } = useQuery(
    api.lists.getCollaborators.queryOptions(
      {
        listId: initialData.id,
      },
      {
        refetchOnWindowFocus: false,
        enabled: list.hasCollaborators,
      },
    ),
  );

  const { data: statsData } = useQuery(
    api.lists.stats.queryOptions(undefined, {
      placeholderData: keepPreviousData,
    }),
  );
  const itemCount = statsData?.stats.get(list.id);

  const parsedQuery = useMemo(() => {
    if (!list.query) {
      return null;
    }
    return parseSearchQuery(list.query);
  }, [list.query]);

  if (error) {
    // This is usually exercised during list deletions.
    if (error.data?.code == "NOT_FOUND") {
      router.push("/dashboard/lists");
    }
  }

  const privacy = list.public
    ? { Icon: Globe, label: t("lists.privacy.public") }
    : list.hasCollaborators
      ? { Icon: Users, label: t("lists.privacy.shared") }
      : { Icon: Lock, label: t("lists.privacy.private") };
  const PrivacyIcon = privacy.Icon;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-4xl">
          {list.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold leading-tight">
            {list.name}
          </h1>
          {list.description && (
            <p className="mt-1 text-muted-foreground">{list.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {itemCount !== undefined && (
              <>
                <span>{t("lists.items_count", { count: itemCount })}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="flex items-center gap-1">
              <PrivacyIcon className="size-3.5" />
              {privacy.label}
            </span>
            {parsedQuery && (
              <>
                <span aria-hidden>·</span>
                <QueryExplainerTooltip
                  parsedSearchQuery={parsedQuery}
                  trigger={
                    <button
                      type="button"
                      className="inline-flex cursor-help items-center gap-1 transition-colors hover:text-foreground"
                    >
                      <Sparkles className="size-3.5" />
                      {t("lists.smart_list")}
                    </button>
                  }
                />
              </>
            )}
            {list.hasCollaborators && collaboratorsData && (
              <div className="group flex items-center">
                {collaboratorsData.owner && (
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="-mr-2 transition-all duration-300 ease-out group-hover:mr-1">
                        <UserAvatar
                          name={collaboratorsData.owner.name}
                          image={collaboratorsData.owner.image}
                          className="size-5 shrink-0 rounded-full ring-2 ring-background"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{collaboratorsData.owner.name}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {collaboratorsData.collaborators.map((collab) => (
                  <Tooltip key={collab.userId}>
                    <TooltipTrigger>
                      <div className="-mr-2 transition-all duration-300 ease-out group-hover:mr-1">
                        <UserAvatar
                          name={collab.user.name}
                          image={collab.user.image}
                          className="size-5 shrink-0 rounded-full ring-2 ring-background"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{collab.user.name}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <ListOptions list={list}>
          <Button variant="ghost">
            <MoreHorizontal />
          </Button>
        </ListOptions>
      </div>
    </div>
  );
}
