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
import { MoreHorizontal, SearchIcon } from "lucide-react";

import { api } from "@karakeep/shared-react/trpc";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

import QueryExplainerTooltip from "../search/QueryExplainerTooltip";
import { ListOptions } from "./ListOptions";

export default function ListHeader({
  initialData,
}: {
  initialData: ZBookmarkList;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: list, error } = api.lists.get.useQuery(
    {
      listId: initialData.id,
    },
    {
      initialData,
    },
  );

  const { data: collaboratorsData } = api.lists.getCollaborators.useQuery(
    {
      listId: initialData.id,
    },
    {
      refetchOnWindowFocus: false,
      enabled: list.hasCollaborators,
    },
  );

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

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-2xl">
          {list.icon} {list.name}
        </span>
        {list.hasCollaborators && collaboratorsData && (
          <div className="group flex">
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
        {list.description && (
          <span className="text-lg text-gray-400">{`(${list.description})`}</span>
        )}
      </div>
      <div className="flex items-center">
        {parsedQuery && (
          <QueryExplainerTooltip
            header={
              <div className="flex items-center justify-center gap-1">
                <SearchIcon className="size-3" />
                <span className="text-sm">{t("lists.smart_list")}</span>
              </div>
            }
            parsedSearchQuery={parsedQuery}
            className="size-6 stroke-foreground"
          />
        )}
        <ListOptions list={list}>
          <Button variant="ghost">
            <MoreHorizontal />
          </Button>
        </ListOptions>
      </div>
    </div>
  );
}
