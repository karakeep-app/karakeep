"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import BookmarkFormattedCreatedAt from "@/components/dashboard/bookmarks/BookmarkFormattedCreatedAt";
import { BookmarkMarkdownComponent } from "@/components/dashboard/bookmarks/BookmarkMarkdownComponent";
import CardImage from "@/components/dashboard/bookmarks/CardImage";
import FooterLinkURL, {
  getDisplayDomain,
} from "@/components/dashboard/bookmarks/FooterLinkURL";
import {
  CARD_ICON_BUTTON_CLASS,
  CARD_META_CLASS,
  CARD_TAG_CLASS,
  CARD_TITLE_CLASS,
} from "@/components/dashboard/bookmarks/icons";
import { ActionButton } from "@/components/ui/action-button";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import tailwindConfig from "@/tailwind.config";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Expand, FileIcon, ImageIcon } from "lucide-react";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import resolveConfig from "tailwindcss/resolveConfig";

import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  BookmarkTypes,
  ZPublicBookmark,
} from "@karakeep/shared/types/bookmarks";
import { ZCursor } from "@karakeep/shared/types/pagination";

function TagPill({ tag }: { tag: string }) {
  return (
    <div
      className={cn(badgeVariants({ variant: "secondary" }), CARD_TAG_CLASS)}
    >
      {tag}
    </div>
  );
}

function PublicCardImage({ href, src }: { href: string; src: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      // The title right below goes to the same place
      tabIndex={-1}
      aria-hidden
      className="relative block h-40 w-full shrink-0 overflow-hidden"
    >
      <CardImage
        src={src}
        alt=""
        className="size-full rounded-t-lg object-cover dark:brightness-90"
      />
    </Link>
  );
}

function ExpandNote({
  bookmark,
  children,
}: {
  bookmark: ZPublicBookmark;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const label = t("public_lists.expand_note");
  return (
    <Dialog>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="none"
              aria-label={label}
              className={cn(
                CARD_ICON_BUTTON_CLASS,
                "absolute bottom-0 right-0 z-10 bg-card/90 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100 [@media(pointer:coarse)]:opacity-100",
              )}
            >
              <Expand className="size-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{label}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <DialogContent className="max-h-96 max-w-3xl overflow-auto">
        <DialogTitle className="sr-only">{bookmark.title ?? label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// The same look as the app's cards, down to the dimmed images in the dark theme,
// without what only the owner gets: the toolbar, the menu and the selection.
function BookmarkCard({ bookmark }: { bookmark: ZPublicBookmark }) {
  const { t } = useTranslation();
  const { content } = bookmark;

  const noteBody = content.type === BookmarkTypes.TEXT && (
    <BookmarkMarkdownComponent readOnly={true}>
      {{
        id: bookmark.id,
        content: {
          text: content.text,
        },
      }}
    </BookmarkMarkdownComponent>
  );

  return (
    <div className="group mb-4 flex flex-col overflow-hidden rounded-lg border border-border bg-card hover:shadow-lg hover:transition-shadow">
      {content.type === BookmarkTypes.LINK && bookmark.bannerImageUrl && (
        <PublicCardImage href={content.url} src={bookmark.bannerImageUrl} />
      )}
      {content.type === BookmarkTypes.ASSET &&
        (bookmark.bannerImageUrl ? (
          <PublicCardImage
            href={content.assetUrl}
            src={bookmark.bannerImageUrl}
          />
        ) : (
          <div className="flex h-14 w-full shrink-0 items-center justify-center bg-muted text-muted-foreground">
            {content.assetType === "image" ? (
              <ImageIcon aria-hidden className="size-4" />
            ) : (
              <FileIcon aria-hidden className="size-4" />
            )}
          </div>
        ))}
      <div className="flex flex-col gap-2 p-3 pb-1.5">
        {content.type === BookmarkTypes.LINK && (
          <Link href={content.url} target="_blank" className={CARD_TITLE_CLASS}>
            {bookmark.title ?? getDisplayDomain(content.url)}
          </Link>
        )}
        {content.type === BookmarkTypes.ASSET && (
          <Link
            href={content.assetUrl}
            target="_blank"
            className={CARD_TITLE_CLASS}
          >
            {bookmark.title ?? t("common.untitled")}
          </Link>
        )}
        {content.type === BookmarkTypes.TEXT && (
          <>
            {bookmark.title && (
              <h3 className={CARD_TITLE_CLASS}>{bookmark.title}</h3>
            )}
            <div className="relative max-h-64 overflow-hidden text-sm">
              {noteBody}
              <ExpandNote bookmark={bookmark}>{noteBody}</ExpandNote>
            </div>
          </>
        )}

        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bookmark.tags.map((tag, index) => (
              <TagPill key={index} tag={tag} />
            ))}
          </div>
        )}

        <div
          className={cn(
            "flex min-h-8 items-center gap-1.5 overflow-hidden whitespace-nowrap",
            CARD_META_CLASS,
          )}
        >
          {content.type === BookmarkTypes.LINK && (
            <>
              <FooterLinkURL url={content.url} />
              <span aria-hidden>•</span>
            </>
          )}
          <span suppressHydrationWarning className="shrink-0">
            <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
          </span>
        </div>
      </div>
    </div>
  );
}

function getBreakpointConfig() {
  const fullConfig = resolveConfig(tailwindConfig);

  const breakpointColumnsObj: { [key: number]: number; default: number } = {
    default: 3,
  };
  breakpointColumnsObj[parseInt(fullConfig.theme.screens.lg)] = 2;
  breakpointColumnsObj[parseInt(fullConfig.theme.screens.md)] = 1;
  breakpointColumnsObj[parseInt(fullConfig.theme.screens.sm)] = 1;
  return breakpointColumnsObj;
}

export default function PublicBookmarkGrid({
  bookmarks: initialBookmarks,
  nextCursor,
  list,
}: {
  list: {
    id: string;
    name: string;
    description: string | null | undefined;
    icon: string;
    numItems: number;
    ownerName: string;
  };
  bookmarks: ZPublicBookmark[];
  nextCursor: ZCursor | null;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      api.publicBookmarks.getPublicBookmarksInList.infiniteQueryOptions(
        { listId: list.id },
        {
          initialData: () => ({
            pages: [{ bookmarks: initialBookmarks, nextCursor, list }],
            pageParams: [null],
          }),
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          refetchOnMount: true,
        },
      ),
    );

  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [loadMoreButtonInView]);

  const breakpointConfig = useMemo(() => getBreakpointConfig(), []);

  const bookmarks = useMemo(() => {
    return data.pages.flatMap((b) => b.bookmarks);
  }, [data]);
  return (
    <>
      <Masonry
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 [container-type:inline-size]"
        breakpointCols={breakpointConfig}
      >
        {bookmarks.map((bookmark) => (
          <BookmarkCard key={bookmark.id} bookmark={bookmark} />
        ))}
      </Masonry>
      {hasNextPage && (
        <div className="flex justify-center">
          <ActionButton
            ref={loadMoreRef}
            ignoreDemoMode={true}
            loading={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            variant="ghost"
          >
            {t("actions.load_more")}
          </ActionButton>
        </div>
      )}
    </>
  );
}
