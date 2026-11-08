import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FileX } from "lucide-react";

import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import ScrollProgressTracker from "@karakeep/shared-react/components/ScrollProgressTracker";
import {
  useCreateHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useReadingProgress } from "@karakeep/shared-react/hooks/reading-progress";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { useDeleteHighlightWithUndo } from "../highlights/useDeleteHighlightWithUndo";
import BookmarkLoadError, { retryBookmarkQuery } from "./BookmarkLoadError";
import ReadingProgressBanner from "./ReadingProgressBanner";

export default function ReaderView({
  bookmarkId,
  className,
  style,
  readOnly,
  progressBarStyle,
  progressBarClassName,
  progressBarAlwaysVisible,
}: {
  bookmarkId: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly: boolean;
  progressBarStyle?: React.CSSProperties;
  progressBarClassName?: string;
  progressBarAlwaysVisible?: boolean;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  const {
    data: cachedContent,
    isPending: isCachedContentLoading,
    error: cachedContentError,
    isFetching: isFetchingCachedContent,
    refetch: refetchCachedContent,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
        includeContent: true,
      },
      {
        retry: retryBookmarkQuery,
        select: (data) =>
          data.content.type == BookmarkTypes.LINK
            ? data.content.htmlContent
            : null,
      },
    ),
  );

  const {
    showBanner,
    bannerPercent,
    onContinue,
    onDismiss,
    restorePosition,
    readingProgressOffset,
    readingProgressAnchor,
    onSavePosition,
    onScrollPositionChange,
  } = useReadingProgress({
    bookmarkId,
  });

  const onHighlightError = () => {
    toast({
      variant: "destructive",
      description: t("common.something_went_wrong"),
    });
  };

  // The highlight appearing in the text says it worked.
  const { mutate: createHighlight } = useCreateHighlight({
    onError: onHighlightError,
  });

  const { mutate: updateHighlight } = useUpdateHighlight({
    onSuccess: () => {
      toast({ description: t("toasts.highlights.updated") });
    },
    onError: onHighlightError,
  });

  const { mutate: deleteHighlight } = useDeleteHighlightWithUndo();

  let content;
  if (isCachedContentLoading) {
    content = <FullPageSpinner />;
  } else if (cachedContentError && cachedContent === undefined) {
    content = (
      <div className="p-4 font-sans">
        <BookmarkLoadError
          error={cachedContentError}
          onRetry={() => refetchCachedContent()}
          isRetrying={isFetchingCachedContent}
        />
      </div>
    );
  } else if (!cachedContent) {
    content = (
      <div className="flex h-full w-full items-center justify-center p-4 font-sans">
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
      <ScrollProgressTracker
        onSavePosition={onSavePosition}
        onScrollPositionChange={onScrollPositionChange}
        restorePosition={restorePosition}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        showProgressBar
        progressBarStyle={progressBarStyle}
        progressBarClassName={cn("print:hidden", progressBarClassName)}
        progressBarFillClassName="bg-foreground/50"
        progressBarAlwaysVisible={progressBarAlwaysVisible}
      >
        {showBanner && (
          <ReadingProgressBanner
            percent={bannerPercent}
            onContinue={onContinue}
            onDismiss={onDismiss}
          />
        )}
        <BookmarkHTMLHighlighter
          className={className}
          style={style}
          htmlContent={cachedContent || ""}
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
              prefix: h.prefix ?? null,
              suffix: h.suffix ?? null,
              note: h.note ?? null,
            })
          }
        />
      </ScrollProgressTracker>
    );
  }
  return content;
}
