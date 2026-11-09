"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookmarkMarkdownComponent } from "@/components/dashboard/bookmarks/BookmarkMarkdownComponent";
import {
  bookmarkLayoutSwitch,
  useBookmarkDisplaySettings,
  useBookmarkLayout,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { NotebookPen } from "lucide-react";

import type { ZBookmarkTypeText } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { getSourceUrl } from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";
import FooterLinkURL from "./FooterLinkURL";

// Without a title of its own a note's first line takes that place: the same size and
// weight as a link's title, and the rest is body text. Going by the rendered line
// keeps the text one piece, which its checkboxes depend on to be saved.
const FIRST_LINE_AS_TITLE_CLASS =
  "[&>:first-child]:first-line:text-base [&>:first-child]:first-line:font-medium [&>:first-child]:first-line:text-foreground";

/**
 * Keeps a note to a handful of lines on every layout, fading out when there's
 * more of it. Clicking the text opens the preview, apart from anything in there
 * with a click of its own, and selecting text doesn't count as clicking.
 */
function ClampedNote({
  bookmarkId,
  rowMaxHeightClass,
  children,
}: {
  bookmarkId: string;
  // For a list's rows, which have the height of a link's title and excerpt to work
  // with: too little for a fade and a link, and the text is clickable anyway
  rowMaxHeightClass?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isClamped, setIsClamped] = useState(false);
  const previewUrl = `/dashboard/preview/${bookmarkId}`;

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    // The tolerance is for the last paragraph's margin, which can count as
    // overflow on its own without any text being cut off
    const observer = new ResizeObserver(() =>
      setIsClamped(body.scrollHeight > body.clientHeight + 8),
    );
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  return (
    // Flex all the way down so it can shrink further in a same-height card, taking
    // the fade along, when a title and tags need the room
    <div
      className={cn(
        "relative flex min-h-0 flex-col [overflow-wrap:anywhere]",
        rowMaxHeightClass ?? "max-h-36",
      )}
    >
      {/* A mouse shortcut: keyboards reach the preview through the links, or o/Enter */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={bodyRef}
        className="min-h-0 cursor-pointer overflow-hidden"
        onClick={(e) => {
          const hasOwnClick = (e.target as Element).closest(
            "a, button, input, label",
          );
          if (!hasOwnClick && !window.getSelection()?.toString()) {
            router.push(previewUrl);
          }
        }}
      >
        {children}
      </div>
      {isClamped && !rowMaxHeightClass && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-16 items-end bg-gradient-to-t from-card from-40% to-transparent">
          <Link
            href={previewUrl}
            // The title link, or o/Enter, are the keyboard's way to the preview
            tabIndex={-1}
            className="pointer-events-auto flex min-h-8 items-end rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [@media(pointer:coarse)]:min-h-11"
          >
            {t("actions.read_note")}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function TextCard({
  bookmark,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmarkTypeText;
  className?: string;
  bookmarkIndex?: number;
}) {
  const banner = bookmark.assets.find((a) => a.assetType == "bannerImage");
  const { showTitle } = useBookmarkDisplaySettings();
  const isListRow = useBookmarkLayout() === "list";
  const hasVisibleTitle = !!bookmark.title && showTitle;
  // Notes have no image to stand in for, so without a banner there's none at all.
  // Apart from in a list, where a tile keeps the titles and the rows lined up.
  const thumbnail = (className: string) =>
    banner ? (
      <div className="relative size-full flex-1">
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          tabIndex={-1}
          aria-hidden
        >
          <Image
            alt="card banner"
            fill={true}
            unoptimized
            className={cn("flex-1 dark:brightness-95", className)}
            src={getAssetUrl(banner.id)}
          />
        </Link>
      </div>
    ) : null;
  return (
    <>
      <BookmarkLayoutAdaptingCard
        title={
          bookmark.title ? (
            <Link href={`/dashboard/preview/${bookmark.id}`}>
              {bookmark.title}
            </Link>
          ) : undefined
        }
        content={
          <ClampedNote
            bookmarkId={bookmark.id}
            rowMaxHeightClass={
              isListRow ? (hasVisibleTitle ? "max-h-6" : "max-h-12") : undefined
            }
          >
            <BookmarkMarkdownComponent
              readOnly={true}
              className={cn(
                "prose-sm prose-headings:my-1 prose-headings:text-sm prose-headings:font-medium prose-p:my-1 prose-code:before:content-none prose-code:after:content-none prose-pre:whitespace-pre-wrap",
                !hasVisibleTitle && FIRST_LINE_AS_TITLE_CLASS,
                // Whole lines, starting at the same height as a link's title
                isListRow && "[&>*]:!my-0",
              )}
            >
              {bookmark}
            </BookmarkMarkdownComponent>
          </ClampedNote>
        }
        footer={
          getSourceUrl(bookmark) && (
            <FooterLinkURL url={getSourceUrl(bookmark)} />
          )
        }
        wrapTags={true}
        bookmark={bookmark}
        className={className}
        bookmarkIndex={bookmarkIndex}
        image={(layout, className) =>
          bookmarkLayoutSwitch(layout, {
            grid: thumbnail(className),
            list: banner ? (
              thumbnail(className)
            ) : (
              <Link
                href={`/dashboard/preview/${bookmark.id}`}
                tabIndex={-1}
                aria-hidden
                className="flex size-full items-center justify-center bg-muted text-muted-foreground"
              >
                <NotebookPen className="size-4" />
              </Link>
            ),
            masonry: thumbnail(className),
            compact: null,
          })
        }
      />
    </>
  );
}
