"use client";

import type { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import useBulkActionsStore from "@/lib/bulkActions";
import { api } from "@/lib/trpc";
import {
  bookmarkLayoutSwitch,
  useBookmarkDisplaySettings,
  useBookmarkLayout,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";
import { Check, Image as ImageIcon, NotebookPen } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";
import { switchCase } from "@karakeep/shared/utils/switch";

import BookmarkActionBar from "./BookmarkActionBar";
import BookmarkFormattedCreatedAt from "./BookmarkFormattedCreatedAt";
import BookmarkOwnerIcon from "./BookmarkOwnerIcon";
import { NotePreview } from "./NotePreview";
import TagList from "./TagList";

interface Props {
  bookmark: ZBookmark;
  image: (layout: BookmarksLayoutTypes, className: string) => ReactNode;
  title?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  className?: string;
  fitHeight?: boolean;
  wrapTags: boolean;
}

function BottomRow({
  footer,
  bookmark,
}: {
  footer?: ReactNode;
  bookmark: ZBookmark;
}) {
  return (
    <div className="justify flex w-full shrink-0 justify-between text-gray-500">
      <div className="flex items-center gap-2 overflow-hidden text-nowrap font-light">
        {footer && <>{footer}•</>}
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          suppressHydrationWarning
        >
          <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
        </Link>
      </div>
      <BookmarkActionBar bookmark={bookmark} />
    </div>
  );
}

function OwnerIndicator({ bookmark }: { bookmark: ZBookmark }) {
  const listContext = useBookmarkListContext();
  const collaborators = api.lists.getCollaborators.useQuery(
    {
      listId: listContext?.id ?? "",
    },
    {
      refetchOnWindowFocus: false,
      enabled: !!listContext?.hasCollaborators,
    },
  );

  if (!listContext || listContext.userRole === "owner" || !collaborators.data) {
    return null;
  }

  let owner = undefined;
  if (bookmark.userId === collaborators.data.owner?.id) {
    owner = collaborators.data.owner;
  } else {
    owner = collaborators.data.collaborators.find(
      (c) => c.userId === bookmark.userId,
    )?.user;
  }

  if (!owner) return null;

  return (
    <div className="absolute right-2 top-2 z-40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <BookmarkOwnerIcon ownerName={owner.name} ownerAvatar={owner.image} />
    </div>
  );
}

function MultiBookmarkSelector({ bookmark }: { bookmark: ZBookmark }) {
  const { selectedBookmarks, isBulkEditEnabled } = useBulkActionsStore();
  const toggleBookmark = useBulkActionsStore((state) => state.toggleBookmark);
  const [isSelected, setIsSelected] = useState(false);
  const { theme } = useTheme();
  const { data: session } = useSession();

  useEffect(() => {
    setIsSelected(selectedBookmarks.some((item) => item.id === bookmark.id));
  }, [selectedBookmarks]);

  // Don't show selector for non-owned bookmarks or when bulk edit is disabled
  const isOwner = session?.user?.id === bookmark.userId;
  if (!isBulkEditEnabled || !isOwner) return null;

  const getIconColor = () => {
    if (theme === "dark") {
      return isSelected ? "black" : "white";
    }
    return isSelected ? "white" : "black";
  };

  const getIconBackgroundColor = () => {
    if (theme === "dark") {
      return isSelected ? "bg-white" : "bg-white bg-opacity-10";
    }
    return isSelected ? "bg-black" : "bg-white bg-opacity-40";
  };

  return (
    <button
      className={cn(
        "absolute left-0 top-0 z-50 h-full w-full bg-opacity-0",
        {
          "bg-opacity-10": isSelected,
        },
        theme === "dark" ? "bg-white" : "bg-black",
      )}
      onClick={() => toggleBookmark(bookmark)}
    >
      <div className="absolute right-2 top-2 z-50 opacity-100">
        <div
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full border border-gray-600",
            getIconBackgroundColor(),
          )}
        >
          <Check size={12} color={getIconColor()} />
        </div>
      </div>
    </button>
  );
}

function ListView({
  bookmark,
  image,
  title,
  content,
  footer,
  className,
}: Props) {
  const { showNotes, showTags, showTitle, imageFit } =
    useBookmarkDisplaySettings();
  const imgFitClass = switchCase(imageFit, {
    cover: "object-cover",
    contain: "object-contain",
  });
  const note = showNotes ? bookmark.note?.trim() : undefined;

  return (
    <div
      className={cn(
        "group relative flex max-h-96 gap-4 overflow-hidden rounded-lg p-2",
        className,
      )}
    >
      <MultiBookmarkSelector bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      <div className="flex size-32 items-center justify-center overflow-hidden">
        {image("list", cn("size-32 rounded-lg", imgFitClass))}
      </div>
      <div className="flex h-full flex-1 flex-col justify-between gap-2 overflow-hidden">
        <div className="flex flex-col gap-2 overflow-hidden">
          {showTitle && title && (
            <div className="line-clamp-2 flex-none shrink-0 overflow-hidden text-ellipsis break-words text-lg">
              {title}
            </div>
          )}
          {content && <div className="shrink-1 overflow-hidden">{content}</div>}
          {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
          {showTags && (
            <div className="flex shrink-0 flex-wrap gap-1 overflow-hidden">
              <TagList
                bookmark={bookmark}
                loading={isBookmarkStillTagging(bookmark)}
              />
            </div>
          )}
        </div>
        <BottomRow footer={footer} bookmark={bookmark} />
      </div>
    </div>
  );
}

function GridView({
  bookmark,
  image,
  title,
  content,
  footer,
  className,
  wrapTags,
  layout,
  fitHeight = false,
}: Props & { layout: BookmarksLayoutTypes }) {
  const { showNotes, showTags, showTitle, imageFit } =
    useBookmarkDisplaySettings();
  const imgFitClass = switchCase(imageFit, {
    cover: "object-cover",
    contain: "object-contain",
  });
  const note = showNotes ? bookmark.note?.trim() : undefined;
  const img = image(
    "grid",
    cn("h-56 min-h-56 w-full rounded-t-lg", imgFitClass),
  );

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg",
        className,
        fitHeight && layout != "grid" ? "max-h-96" : "h-96",
      )}
    >
      <MultiBookmarkSelector bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      {img && <div className="h-56 w-full shrink-0 overflow-hidden">{img}</div>}
      <div className="flex h-full flex-col justify-between gap-2 overflow-hidden p-2">
        <div className="grow-1 flex flex-col gap-2 overflow-hidden">
          {showTitle && title && (
            <div className="line-clamp-2 flex-none shrink-0 overflow-hidden text-ellipsis break-words text-lg">
              {title}
            </div>
          )}
          {content && <div className="shrink-1 overflow-hidden">{content}</div>}
          {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
          {showTags && (
            <div className="flex shrink-0 flex-wrap gap-1 overflow-hidden">
              <TagList
                className={wrapTags ? undefined : "h-full"}
                bookmark={bookmark}
                loading={isBookmarkStillTagging(bookmark)}
              />
            </div>
          )}
        </div>
        <BottomRow footer={footer} bookmark={bookmark} />
      </div>
    </div>
  );
}

function CompactView({ bookmark, title, footer, className }: Props) {
  const { showTitle } = useBookmarkDisplaySettings();
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg",
        className,
        "max-h-96",
      )}
    >
      <MultiBookmarkSelector bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      <div className="flex h-full justify-between gap-2 overflow-hidden p-2">
        <div className="flex items-center gap-2">
          {bookmark.content.type === BookmarkTypes.LINK &&
            bookmark.content.favicon && (
              <Image
                src={bookmark.content.favicon}
                alt="favicon"
                width={5}
                unoptimized
                height={5}
                className="size-5"
              />
            )}
          {bookmark.content.type === BookmarkTypes.TEXT && (
            <NotebookPen className="size-5" />
          )}
          {bookmark.content.type === BookmarkTypes.ASSET && (
            <ImageIcon className="size-5" />
          )}
          {showTitle && (
            <div className="shrink-1 text-md line-clamp-1 overflow-hidden text-ellipsis break-words">
              {title ?? "Untitled"}
            </div>
          )}
          {footer && (
            <p className="flex shrink-0 gap-2 text-gray-500">•{footer}</p>
          )}
          <p className="text-gray-500">•</p>
          <Link
            href={`/dashboard/preview/${bookmark.id}`}
            suppressHydrationWarning
            className="shrink-0 gap-2 text-gray-500"
          >
            <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
          </Link>
        </div>
        <BookmarkActionBar bookmark={bookmark} />
      </div>
    </div>
  );
}

export function BookmarkLayoutAdaptingCard(props: Props) {
  const layout = useBookmarkLayout();

  return bookmarkLayoutSwitch(layout, {
    masonry: <GridView layout={layout} {...props} />,
    grid: <GridView layout={layout} {...props} />,
    list: <ListView {...props} />,
    compact: <CompactView {...props} />,
  });
}
