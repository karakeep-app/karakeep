"use client";

import { useRef } from "react";
import { api } from "@/lib/trpc";
import { useDragAndDrop } from "@/lib/drag-and-drop";
import { toast } from "@/components/ui/use-toast";
import Draggable from "react-draggable";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";
import { useAddBookmarkToList } from "@karakeep/shared-react/hooks/lists";

import AssetCard from "./AssetCard";
import LinkCard from "./LinkCard";
import TextCard from "./TextCard";
import UnknownCard from "./UnknownCard";

export default function BookmarkCard({
  bookmark: initialData,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const draggableRef = useRef<HTMLDivElement>(null);

  const { data: bookmark } = api.bookmarks.getBookmark.useQuery(
    {
      bookmarkId: initialData.id,
    },
    {
      initialData,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) {
          return false;
        }
        return getBookmarkRefreshInterval(data);
      },
    },
  );

  const { mutate: addToList } = useAddBookmarkToList({
    onSuccess: () => {
      toast({
        description: "Bookmark added to list!",
      });
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        toast({
          variant: "destructive",
          description: e.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to add bookmark to list",
        });
      }
    },
  });

  const dragAndDropFunction = useDragAndDrop(
    "data-list-id",
    (listId: string) => {
      addToList({
        listId,
        bookmarkId: bookmark.id,
      });
    },
  );

  let cardContent: React.ReactNode;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      cardContent = (
        <LinkCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
      break;
    case BookmarkTypes.TEXT:
      cardContent = (
        <TextCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
      break;
    case BookmarkTypes.ASSET:
      cardContent = (
        <AssetCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
      break;
    case BookmarkTypes.UNKNOWN:
      cardContent = <UnknownCard className={className} bookmark={bookmark} />;
      break;
  }

  return (
    <Draggable
      axis="both"
      onStart={dragAndDropFunction.handleDragStart}
      onStop={dragAndDropFunction.handleDragEnd}
      defaultClassNameDragging="z-50 cursor-grabbing opacity-70"
      position={{ x: 0, y: 0 }}
      nodeRef={draggableRef}
    >
      <div ref={draggableRef} className="cursor-grab">
        {cardContent}
      </div>
    </Draggable>
  );
}
