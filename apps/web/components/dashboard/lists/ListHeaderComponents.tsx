import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Globe, Lock, Users } from "lucide-react";

export function ListPrivacyLabel({
  list,
  className,
}: {
  list: ZBookmarkList;
  className?: string;
}) {
  const { t } = useTranslation();

  const privacy = list.public
    ? { Icon: Globe, label: t("lists.privacy.public") }
    : list.hasCollaborators
      ? { Icon: Users, label: t("lists.privacy.shared") }
      : { Icon: Lock, label: t("lists.privacy.private") };
  const PrivacyIcon = privacy.Icon;

  return (
    <span className={cn("flex items-center gap-1", className)}>
      <PrivacyIcon className="size-3.5" />
      {privacy.label}
    </span>
  );
}

export function ListCollaboratorsIcons({
  list,
  className,
}: {
  list: ZBookmarkList;
  className?: string;
}) {
  const api = useTRPC();
  const { data: collaboratorsData } = useQuery(
    api.lists.getCollaborators.queryOptions(
      {
        listId: list.id,
      },
      {
        refetchOnWindowFocus: false,
        enabled: list.hasCollaborators,
      },
    ),
  );
  return (
    list.hasCollaborators &&
    collaboratorsData && (
      <div className={cn("group flex items-center", className)}>
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
    )
  );
}

export function ListItemCount({
  list,
  className,
}: {
  list: ZBookmarkList;
  className?: string;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: statsData } = useQuery(
    api.lists.stats.queryOptions(undefined, {
      placeholderData: keepPreviousData,
      enabled: !!list?.id,
    }),
  );
  const itemCount = statsData?.stats.get(list.id);

  return (
    itemCount !== undefined && (
      <div className={className}>
        <span>{t("lists.items_count", { count: itemCount })}</span>
      </div>
    )
  );
}
