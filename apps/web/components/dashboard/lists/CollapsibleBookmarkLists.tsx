import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { api } from "@/lib/trpc";
import { keepPreviousData } from "@tanstack/react-query";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkList } from "@karakeep/shared/types/lists";
import { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";

type RenderFunc = (params: {
  node: ZBookmarkListTreeNode;
  level: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numBookmarks?: number;
}) => React.ReactNode;

type IsOpenFunc = (list: ZBookmarkListTreeNode) => boolean;

function ListItem({
  node,
  render,
  level,
  className,
  isOpenFunc,
  listStats,
  indentOffset,
}: {
  node: ZBookmarkListTreeNode;
  render: RenderFunc;
  isOpenFunc: IsOpenFunc;
  listStats?: Map<string, number>;
  level: number;
  indentOffset: number;
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

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      {render({
        node,
        level: level + indentOffset,
        open,
        onOpenChange: setOpen,
        numBookmarks: listStats?.get(node.item.id),
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
              indentOffset={indentOffset}
              listStats={listStats}
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
  filter,
  indentOffset = 0,
}: {
  initialData: ZBookmarkList[];
  render: RenderFunc;
  isOpenFunc?: IsOpenFunc;
  className?: string;
  filter?: (node: ZBookmarkListTreeNode) => boolean;
  indentOffset?: number;
}) {
  let { data } = useBookmarkLists(undefined, {
    initialData: { lists: initialData },
  });
  const { data: listStats } = api.lists.stats.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });

  if (!data) {
    return <FullPageSpinner />;
  }

  const rootNodes = Object.values(data.root);
  const filteredRoots = filter ? rootNodes.filter(filter) : rootNodes;

  return (
    <div>
      {filteredRoots
        .sort((a, b) => a.item.name.localeCompare(b.item.name))
        .map((node) => (
          <ListItem
            key={node.item.id}
            node={node}
            render={render}
            level={0}
            indentOffset={indentOffset}
            className={className}
            listStats={listStats?.stats}
            isOpenFunc={isOpenFunc ?? (() => false)}
          />
        ))}
    </div>
  );
}
