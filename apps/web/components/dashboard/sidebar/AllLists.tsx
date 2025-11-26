"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleTriggerTriangle } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { CirclePlus, MoreHorizontal } from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
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

  return (
    <>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>Lists</SidebarGroupLabel>
        <SidebarGroupAction>
          <EditListModal>
            <Link href="#">
              <CirclePlus className="size-4" strokeWidth={1.5} />
            </Link>
          </EditListModal>
        </SidebarGroupAction>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathName === "/dashboard/lists"}>
                <Link href="/dashboard/lists">
                  <span className="text-lg">📋</span>
                  <span>{t("lists.all_lists")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathName === "/dashboard/favourites"}>
                <Link href="/dashboard/favourites">
                  <span className="text-lg">⭐️</span>
                  <span>{t("lists.favourites")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <CollapsibleBookmarkLists
              initialData={initialData.lists}
              isOpenFunc={isNodeOpen}
              render={({ item: node, level, open, numBookmarks }) => (
                <SidebarMenuItem style={{ marginLeft: `${level * 1}rem` }}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathName === `/dashboard/lists/${node.item.id}`}
                  >
                    <Link href={`/dashboard/lists/${node.item.id}`}>
                      {node.children.length > 0 && (
                        <CollapsibleTriggerTriangle
                          className="absolute left-0.5 top-1/2 size-2 -translate-y-1/2"
                          open={open}
                        />
                      )}
                      <span className="text-lg">{node.item.icon}</span>
                      <span>{node.item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuAction>
                    <ListOptions
                      onOpenChange={(open) => {
                        if (open) {
                          setSelectedListId(node.item.id);
                        } else {
                          setSelectedListId(null);
                        }
                      }}
                      list={node.item}
                    >
                      <Button size="none" variant="ghost" className="relative size-full">
                        <MoreHorizontal
                          className={cn(
                            "absolute inset-0 m-auto size-4 opacity-0 transition-opacity duration-100 group-hover/menu-item:opacity-100",
                            selectedListId == node.item.id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />

                        <Badge
                          variant="outline"
                          className={cn(
                            "font-normal opacity-100 transition-opacity duration-100 group-hover/menu-item:opacity-0",
                            selectedListId == node.item.id ||
                              numBookmarks === undefined
                              ? "opacity-0"
                              : "opacity-100",
                          )}
                        >
                          {numBookmarks}
                        </Badge>
                      </Button>
                    </ListOptions>
                  </SidebarMenuAction>
                </SidebarMenuItem>
              )}
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
