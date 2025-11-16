"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import SidebarItem from "@/components/shared/sidebar/SidebarItem";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTriggerTriangle,
} from "@/components/ui/collapsible";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  listsToTree,
  ZBookmarkListTreeNode,
} from "@karakeep/shared/utils/listUtils";

function ListItem({
  node,
  level,
  isOpenFunc,
}: {
  node: ZBookmarkListTreeNode;
  level: number;
  isOpenFunc: (node: ZBookmarkListTreeNode) => boolean;
}) {
  const isAnyChildOpen = (
    node: ZBookmarkListTreeNode,
    isOpenFunc: (node: ZBookmarkListTreeNode) => boolean,
  ): boolean => {
    if (isOpenFunc(node)) {
      return true;
    }
    return node.children.some((l) => isAnyChildOpen(l, isOpenFunc));
  };

  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen((curr) => curr || isAnyChildOpen(node, isOpenFunc));
  }, [node, isOpenFunc]);

  const { data: listStats } = api.lists.stats.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });

  const numBookmarks = listStats?.stats.get(node.item.id);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
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
        className="group px-0.5 opacity-75"
        right={
          <Badge
            variant="outline"
            className={cn(
              "font-normal opacity-100",
              numBookmarks === undefined && "opacity-0",
            )}
          >
            {numBookmarks}
          </Badge>
        }
        linkClassName="py-0.5"
        style={{ marginLeft: `${level * 1}rem` }}
      />
      <CollapsibleContent>
        {node.children
          .sort((a, b) => a.item.name.localeCompare(b.item.name))
          .map((l) => (
            <ListItem
              key={l.item.id}
              node={l}
              level={level + 1}
              isOpenFunc={isOpenFunc}
            />
          ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function SharedListsSection({
  sharedLists,
}: {
  sharedLists: ZBookmarkList[];
}) {
  const pathName = usePathname();
  const isNodeOpen = useCallback(
    (node: ZBookmarkListTreeNode) => pathName.includes(node.item.id),
    [pathName],
  );

  const treeData = useMemo(() => listsToTree(sharedLists), [sharedLists]);

  if (!sharedLists || sharedLists.length === 0) {
    return null;
  }

  return (
    <>
      <li className="mb-2 mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span>Shared with me</span>
      </li>
      {Object.values(treeData.root)
        .sort((a, b) => a.item.name.localeCompare(b.item.name))
        .map((node) => (
          <ListItem
            key={node.item.id}
            node={node}
            level={0}
            isOpenFunc={isNodeOpen}
          />
        ))}
    </>
  );
}
