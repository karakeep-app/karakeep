"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SidebarItem from "@/components/shared/sidebar/SidebarItem";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTriggerTriangle,
} from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Plus } from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  augmentBookmarkListsWithInitialData,
  useBookmarkLists,
} from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";

import { CollapsibleBookmarkLists } from "../lists/CollapsibleBookmarkLists";
import { EditListModal } from "../lists/EditListModal";
import { ListOptions } from "../lists/ListOptions";

export default function AllLists({
  initialData,
}: {
  initialData: { lists: ZBookmarkList[] };
}) {
  const { t } = useTranslation();
  const pathName = usePathname();
  const isNodeOpen = useCallback(
    (node: ZBookmarkListTreeNode) => pathName.includes(node.item.id),
    [pathName],
  );

  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  // Fetch live lists data
  const { data: listsData } = useBookmarkLists(undefined, {
    initialData: { lists: initialData.lists },
  });
  const lists = augmentBookmarkListsWithInitialData(
    listsData,
    initialData.lists,
  );

  // Check if any shared list is currently being viewed
  const isViewingSharedList = useMemo(() => {
    return lists.data.some(
      (list) => list.userRole !== "owner" && pathName.includes(list.id),
    );
  }, [lists.data, pathName]);

  // Check if there are any shared lists
  const hasSharedLists = useMemo(() => {
    return lists.data.some((list) => list.userRole !== "owner");
  }, [lists.data]);

  const [sharedListsOpen, setSharedListsOpen] = useState(isViewingSharedList);

  // Auto-open shared lists if viewing one
  useEffect(() => {
    if (isViewingSharedList && !sharedListsOpen) {
      setSharedListsOpen(true);
    }
  }, [isViewingSharedList, sharedListsOpen]);

  return (
    <ul className="max-h-full gap-y-2 overflow-auto text-sm">
      <li className="flex justify-between pb-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Lists
        </p>
        <EditListModal>
          <Link href="#">
            <Plus
              className="mr-2 size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
          </Link>
        </EditListModal>
      </li>
      <SidebarItem
        logo={<span className="text-lg">📋</span>}
        name={t("lists.all_lists")}
        path={`/dashboard/lists`}
        linkClassName="py-0.5"
        className="px-0.5"
      />
      <SidebarItem
        logo={<span className="text-lg">⭐️</span>}
        name={t("lists.favourites")}
        path={`/dashboard/favourites`}
        linkClassName="py-0.5"
        className="px-0.5"
      />

      {/* Owned Lists */}
      <CollapsibleBookmarkLists
        listsData={lists}
        filter={(node) => node.item.userRole === "owner"}
        isOpenFunc={isNodeOpen}
        render={({ node, level, open, numBookmarks }) => (
          <SidebarItem
            collapseButton={
              node.children.length > 0 && (
                <CollapsibleTriggerTriangle
                  className="absolute left-0.5 top-1/2 size-2 -translate-y-1/2"
                  open={open}
                />
              )
            }
            logo={
              <span className="flex">
                <span className="text-lg"> {node.item.icon}</span>
              </span>
            }
            name={node.item.name}
            path={`/dashboard/lists/${node.item.id}`}
            className="group px-0.5"
            right={
              <ListOptions
                onOpenChange={(isOpen) => {
                  if (isOpen) {
                    setSelectedListId(node.item.id);
                  } else {
                    setSelectedListId(null);
                  }
                }}
                list={node.item}
              >
                <Button size="none" variant="ghost" className="relative">
                  <MoreHorizontal
                    className={cn(
                      "absolute inset-0 m-auto size-4 opacity-0 transition-opacity duration-100 group-hover:opacity-100",
                      selectedListId == node.item.id
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span
                    className={cn(
                      "px-2.5 text-xs font-light text-muted-foreground opacity-100 transition-opacity duration-100 group-hover:opacity-0",
                      selectedListId == node.item.id ||
                        numBookmarks === undefined
                        ? "opacity-0"
                        : "opacity-100",
                    )}
                  >
                    {numBookmarks}
                  </span>
                </Button>
              </ListOptions>
            }
            linkClassName="py-0.5"
            style={{ marginLeft: `${level * 1}rem` }}
          />
        )}
      />

      {/* Shared Lists */}
      {hasSharedLists && (
        <Collapsible open={sharedListsOpen} onOpenChange={setSharedListsOpen}>
          <SidebarItem
            collapseButton={
              <CollapsibleTriggerTriangle
                className="absolute left-0.5 top-1/2 size-2 -translate-y-1/2"
                open={sharedListsOpen}
              />
            }
            logo={<span className="text-lg">👥</span>}
            name={t("lists.shared_lists")}
            path="#"
            linkClassName="py-0.5"
            className="px-0.5"
          />
          <CollapsibleContent>
            <CollapsibleBookmarkLists
              listsData={lists}
              filter={(node) => node.item.userRole !== "owner"}
              isOpenFunc={isNodeOpen}
              indentOffset={1}
              render={({ node, level, open, numBookmarks }) => (
                <SidebarItem
                  collapseButton={
                    node.children.length > 0 && (
                      <CollapsibleTriggerTriangle
                        className="absolute left-0.5 top-1/2 size-2 -translate-y-1/2"
                        open={open}
                      />
                    )
                  }
                  logo={
                    <span className="flex">
                      <span className="text-lg"> {node.item.icon}</span>
                    </span>
                  }
                  name={node.item.name}
                  path={`/dashboard/lists/${node.item.id}`}
                  className="group px-0.5"
                  right={
                    <ListOptions
                      onOpenChange={(isOpen) => {
                        if (isOpen) {
                          setSelectedListId(node.item.id);
                        } else {
                          setSelectedListId(null);
                        }
                      }}
                      list={node.item}
                    >
                      <Button size="none" variant="ghost" className="relative">
                        <MoreHorizontal
                          className={cn(
                            "absolute inset-0 m-auto size-4 opacity-0 transition-opacity duration-100 group-hover:opacity-100",
                            selectedListId == node.item.id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <span
                          className={cn(
                            "px-2.5 text-xs font-light text-muted-foreground opacity-100 transition-opacity duration-100 group-hover:opacity-0",
                            selectedListId == node.item.id ||
                              numBookmarks === undefined
                              ? "opacity-0"
                              : "opacity-100",
                          )}
                        >
                          {numBookmarks}
                        </span>
                      </Button>
                    </ListOptions>
                  }
                  linkClassName="py-0.5"
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
