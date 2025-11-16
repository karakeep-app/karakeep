"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import HighlightCard from "@/components/dashboard/highlights/HighlightCard";
import ReaderView from "@/components/dashboard/preview/ReaderView";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  HighlighterIcon as Highlight,
  Minus,
  Plus,
  Printer,
  Settings,
  Type,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";

import { api } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
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
  const [fontSize, setFontSize] = useState([18]);
  const [lineHeight, setLineHeight] = useState([1.6]);
  const [fontFamily, setFontFamily] = useState("serif");
  const [showHighlights, setShowHighlights] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const isOwner = session?.user?.id === bookmark?.userId;

  const fontFamilies = {
    serif: "ui-serif, Georgia, Cambria, serif",
    sans: "ui-sans-serif, system-ui, sans-serif",
    mono: "ui-monospace, Menlo, Monaco, monospace",
  };

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

            <Popover open={showSettings} onOpenChange={setShowSettings}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-80">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2">
                    <Type className="h-4 w-4" />
                    <h3 className="font-semibold">Reading Settings</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Font Family</label>
                      <Select value={fontFamily} onValueChange={setFontFamily}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="serif">Serif</SelectItem>
                          <SelectItem value="sans">Sans Serif</SelectItem>
                          <SelectItem value="mono">Monospace</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Font Size</label>
                        <span className="text-sm text-muted-foreground">
                          {fontSize[0]}px
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 bg-transparent"
                          onClick={() =>
                            setFontSize([Math.max(12, fontSize[0] - 1)])
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Slider
                          value={fontSize}
                          onValueChange={setFontSize}
                          max={24}
                          min={12}
                          step={1}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 bg-transparent"
                          onClick={() =>
                            setFontSize([Math.min(24, fontSize[0] + 1)])
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                          Line Height
                        </label>
                        <span className="text-sm text-muted-foreground">
                          {lineHeight[0]}
                        </span>
                      </div>
                      <Slider
                        value={lineHeight}
                        onValueChange={setLineHeight}
                        max={2.5}
                        min={1.2}
                        step={0.1}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

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
                      fontFamily:
                        fontFamilies[fontFamily as keyof typeof fontFamilies],
                      fontSize: `${fontSize[0] * 1.8}px`,
                      lineHeight: lineHeight[0] * 0.9,
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
                        fontFamily:
                          fontFamilies[fontFamily as keyof typeof fontFamilies],
                        fontSize: `${fontSize[0]}px`,
                        lineHeight: lineHeight[0],
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
