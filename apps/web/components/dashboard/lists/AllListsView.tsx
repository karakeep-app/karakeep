"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EditListModal } from "@/components/dashboard/lists/EditListModal";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTriggerChevron,
} from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/client";
import { MoreHorizontal, Plus } from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  augmentBookmarkListsWithInitialData,
  useBookmarkLists,
} from "@karakeep/shared-react/hooks/lists";

import { CollapsibleBookmarkLists } from "./CollapsibleBookmarkLists";
import { ListOptions } from "./ListOptions";

function ListItem({
  name,
  icon,
  path,
  style,
  list,
  open,
  collapsible,
}: {
  name: string;
  icon: string;
  path: string;
  style?: React.CSSProperties;
  list?: ZBookmarkList;
  open?: boolean;
  collapsible: boolean;
}) {
  return (
    <li
      className="my-2 flex items-center justify-between rounded-md border border-border p-2 hover:bg-accent/50"
      style={style}
    >
      <span className="flex flex-1 items-center gap-1">
        {collapsible && (
          <CollapsibleTriggerChevron className="size-5" open={open ?? false} />
        )}
        <Link href={path} className="flex flex-1 gap-1">
          <p className="text-nowrap text-lg">
            {icon} {name}
          </p>
        </Link>
      </span>
      {list && (
        <ListOptions list={list}>
          <Button
            className="flex h-full items-center justify-end"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        </ListOptions>
      )}
    </li>
  );
}

export default function AllListsView({
  initialData,
}: {
  initialData: ZBookmarkList[];
}) {
  const { t } = useTranslation();

  // Fetch live lists data
  const { data: listsData } = useBookmarkLists(undefined, {
    initialData: { lists: initialData },
  });
  const lists = augmentBookmarkListsWithInitialData(listsData, initialData);

  // Check if there are any shared lists
  const hasSharedLists = useMemo(() => {
    return lists.data.some((list) => list.userRole !== "owner");
  }, [lists.data]);

  const [sharedListsOpen, setSharedListsOpen] = useState(true);

  return (
    <ul>
      <EditListModal>
        <Button className="mb-2 flex h-full w-full items-center">
          <Plus />
          <span>{t("lists.new_list")}</span>
        </Button>
      </EditListModal>
      <ListItem
        collapsible={false}
        name={t("lists.favourites")}
        icon="⭐️"
        path={`/dashboard/favourites`}
      />
      <ListItem
        collapsible={false}
        name={t("common.archive")}
        icon="🗄️"
        path={`/dashboard/archive`}
      />

      {/* Owned Lists */}
      <CollapsibleBookmarkLists
        listsData={lists}
        filter={(node) => node.item.userRole === "owner"}
        render={({ node, level, open }) => (
          <ListItem
            name={node.item.name}
            icon={node.item.icon}
            list={node.item}
            path={`/dashboard/lists/${node.item.id}`}
            collapsible={node.children.length > 0}
            open={open}
            style={{ marginLeft: `${level * 1}rem` }}
          />
        )}
      />

      {/* Shared Lists */}
      {hasSharedLists && (
        <Collapsible open={sharedListsOpen} onOpenChange={setSharedListsOpen}>
          <ListItem
            collapsible={true}
            name={t("lists.shared_lists")}
            icon="👥"
            path="#"
            open={sharedListsOpen}
          />
          <CollapsibleContent>
            <CollapsibleBookmarkLists
              listsData={lists}
              filter={(node) => node.item.userRole !== "owner"}
              indentOffset={1}
              render={({ node, level, open }) => (
                <ListItem
                  name={node.item.name}
                  icon={node.item.icon}
                  list={node.item}
                  path={`/dashboard/lists/${node.item.id}`}
                  collapsible={node.children.length > 0}
                  open={open}
                  style={{ marginLeft: `${level * 1}rem` }}
                />
              )}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </ul>
  );
}
