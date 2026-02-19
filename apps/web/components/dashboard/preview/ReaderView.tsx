import { useEffect, useRef, useState } from "react";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { FileX } from "lucide-react";

import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useReadingProgress } from "@karakeep/shared-react/hooks/reading-progress";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import ReadingProgressBanner from "./ReadingProgressBanner";

interface ReaderViewProps {
  bookmarkId: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly: boolean;
}

function ReaderView({
  bookmarkId,
  className,
  style,
  readOnly,
}: ReaderViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  const { data: bookmark, isPending: isCachedContentLoading } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
        includeContent: true,
      },
      {
        select: (data) =>
          data.content.type == BookmarkTypes.LINK
            ? {
                htmlContent: data.content.htmlContent,
                readingProgressOffset: data.content.readingProgressOffset,
                readingProgressAnchor: data.content.readingProgressAnchor,
                readingProgressPercent: data.content.readingProgressPercent,
              }
            : null,
      },
    ),
  );

  // Track when content is ready for reading progress restoration
  const [contentReady, setContentReady] = useState(false);

  // Get initial reading progress from bookmark content
  const initialOffset = bookmark?.readingProgressOffset ?? null;
  const initialAnchor = bookmark?.readingProgressAnchor ?? null;

  // Auto-save reading progress on page unload/visibility change
  const { hasSavedPosition, scrollToSavedPosition, dismissSavedPosition } =
    useReadingProgress({
      bookmarkId,
      initialOffset,
      initialAnchor,
      containerRef: contentRef,
      contentReady,
    });

  // Signal to parent when content is ready for reading progress restoration
  useEffect(() => {
    if (!isCachedContentLoading && bookmark?.htmlContent) {
      setContentReady(true);
    }
  }, [isCachedContentLoading, bookmark?.htmlContent]);

  const { mutate: createHighlight } = useCreateHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been created!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  const { mutate: updateHighlight } = useUpdateHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been updated!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  const { mutate: deleteHighlight } = useDeleteHighlight({
    onSuccess: () => {
      toast({
        description: "Highlight has been deleted!",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "Something went wrong",
      });
    },
  });

  let content;
  if (isCachedContentLoading) {
    content = <FullPageSpinner />;
  } else if (!bookmark?.htmlContent) {
    content = (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="max-w-sm space-y-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileX className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">
              {t("preview.fetch_error_title")}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("preview.fetch_error_description")}
            </p>
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <div>
        {hasSavedPosition && (
          <ReadingProgressBanner
            percent={bookmark?.readingProgressPercent ?? null}
            onContinue={scrollToSavedPosition}
            onDismiss={dismissSavedPosition}
          />
        )}
        <BookmarkHTMLHighlighter
          ref={contentRef}
          className={className}
          style={style}
          htmlContent={bookmark?.htmlContent || ""}
          highlights={highlights?.highlights ?? []}
          readOnly={readOnly}
          onDeleteHighlight={(h) =>
            deleteHighlight({
              highlightId: h.id,
            })
          }
          onUpdateHighlight={(h) =>
            updateHighlight({
              highlightId: h.id,
              color: h.color,
              note: h.note,
            })
          }
          onHighlight={(h) =>
            createHighlight({
              startOffset: h.startOffset,
              endOffset: h.endOffset,
              color: h.color,
              bookmarkId,
              text: h.text,
              note: h.note ?? null,
            })
          }
        />
      </div>
    );
  }
  return content;
}

export default ReaderView;
