import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { api } from "@/lib/trpc";
import { keepPreviousData } from "@tanstack/react-query";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkList } from "@karakeep/shared/types/lists";
import { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";

type RenderFunc = (params: {
  item: ZBookmarkListTreeNode;
  level: number;
  open: boolean;
  numBookmarks?: number;
}) => React.ReactNode;

type IsOpenFunc = (list: ZBookmarkListTreeNode) => boolean;

function ListItem({
  node,
  render,
  level,
  className,
  isOpenFunc,
}: {
  node: ZBookmarkListTreeNode;
  render: RenderFunc;
  isOpenFunc: IsOpenFunc;
  level: number;
  className?: string;
}) {
  // Not the most efficient way to do this, but it works for now
  const isAnyChildOpen = (
    node: ZBookmarkListTreeNode,
    isOpenFunc: IsOpenFunc,
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

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      {render({
        item: node,
        level,
        open,
        numBookmarks: listStats?.stats.get(node.item.id),
      })}
      <CollapsibleContent>
        {node.children
          .sort((a, b) => a.item.name.localeCompare(b.item.name))
          .map((l) => (
            <ListItem
              isOpenFunc={isOpenFunc}
              key={l.item.id}
              node={l}
              render={render}
              level={level + 1}
              className={className}
            />
          ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CollapsibleBookmarkLists({
  render,
  initialData,
  className,
  isOpenFunc,
}: {
  initialData: ZBookmarkList[];
  render: RenderFunc;
  isOpenFunc?: IsOpenFunc;
  className?: string;
}) {
  let { data } = useBookmarkLists(undefined, {
    initialData: { lists: initialData },
  });

  if (!data) {
    return <FullPageSpinner />;
  }

  const { root } = data;

  return (
    <div>
      {Object.values(root)
        .sort((a, b) => a.item.name.localeCompare(b.item.name))
        .map((l) => (
          <ListItem
            key={l.item.id}
            node={l}
            render={render}
            level={0}
            className={className}
            isOpenFunc={isOpenFunc ?? (() => false)}
          />
        ))}
    </div>
  );
}
