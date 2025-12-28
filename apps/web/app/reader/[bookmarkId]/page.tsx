"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import HighlightCard from "@/components/dashboard/highlights/HighlightCard";
import ReaderSettingsPopover from "@/components/dashboard/preview/ReaderSettingsPopover";
import ReaderView from "@/components/dashboard/preview/ReaderView";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Separator } from "@/components/ui/separator";
import { useReaderSettings } from "@/lib/readerSettings";
import { HighlighterIcon as Highlight, Printer, X } from "lucide-react";
import { useSession } from "next-auth/react";

import { api } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { READER_FONT_FAMILIES } from "@karakeep/shared/types/readers";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

export default function ReaderViewPage() {
  const params = useParams<{ bookmarkId: string }>();
  const bookmarkId = params.bookmarkId;
  const { data: highlights } = api.highlights.getForBookmark.useQuery({
    bookmarkId,
  });
  const { data: bookmark } = api.bookmarks.getBookmark.useQuery({
    bookmarkId,
  });

  const { data: session } = useSession();
  const router = useRouter();
  const { settings } = useReaderSettings();
  const [showHighlights, setShowHighlights] = useState(false);
  const isOwner = session?.user?.id === bookmark?.userId;

  const onClose = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Reader View</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
            </Button>

            <ReaderSettingsPopover variant="ghost" />

            <Button
              variant={showHighlights ? "default" : "ghost"}
              size="icon"
              onClick={() => setShowHighlights(!showHighlights)}
            >
              <Highlight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex overflow-hidden">
        {/* Mobile backdrop */}
        {showHighlights && (
          <button
            className="fixed inset-0 top-14 z-40 bg-black/50 lg:hidden"
            onClick={() => setShowHighlights(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowHighlights(false);
              }
            }}
            aria-label="Close highlights sidebar"
          />
        )}

        {/* Main Content */}
        <main
          className={`flex-1 overflow-x-hidden transition-all duration-300 ${showHighlights ? "lg:mr-80" : ""}`}
        >
          <article className="mx-auto max-w-3xl overflow-x-hidden px-4 py-8 sm:px-6">
            {bookmark ? (
              <>
                {/* Article Header */}
                <header className="mb-8 space-y-4">
                  <h1
                    className="font-bold leading-tight"
                    style={{
                      fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
                      fontSize: `${settings.fontSize * 1.8}px`,
                      lineHeight: settings.lineHeight * 0.9,
                    }}
                  >
                    {getBookmarkTitle(bookmark)}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {bookmark.content.type == BookmarkTypes.LINK && (
                      <span>By {bookmark.content.author}</span>
                    )}
                    <Separator orientation="vertical" className="h-4" />
                    <span>8 min</span>
                  </div>
                </header>

                {/* Article Content */}
                <Suspense fallback={<FullPageSpinner />}>
                  <div className="overflow-x-hidden">
                    <ReaderView
                      className="prose prose-neutral max-w-none break-words dark:prose-invert [&_code]:break-all [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto"
                      style={{
                        fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: settings.lineHeight,
                      }}
                      bookmarkId={bookmarkId}
                      readOnly={!isOwner}
                    />
                  </div>
                </Suspense>
              </>
            ) : (
              <FullPageSpinner />
            )}
          </article>
        </main>

        {/* Highlights Sidebar */}
        {showHighlights && highlights && (
          <aside className="fixed right-0 top-14 z-50 h-[calc(100vh-3.5rem)] w-full border-l bg-background sm:w-80 lg:z-auto lg:bg-background/95 lg:backdrop-blur lg:supports-[backdrop-filter]:bg-background/60 print:hidden">
            <div className="flex h-full flex-col">
              <div className="border-b p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Highlights</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {highlights.highlights.length} saved
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 lg:hidden"
                      onClick={() => setShowHighlights(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <div className="space-y-4">
                  {highlights.highlights.map((highlight) => (
                    <HighlightCard
                      key={highlight.id}
                      highlight={highlight}
                      clickable={true}
                      readOnly={!isOwner}
                    />
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
