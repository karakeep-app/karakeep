import { useCallback, useRef, useState } from "react";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileX } from "lucide-react";

import type { ReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";
import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import ScrollProgressTracker from "@karakeep/shared-react/components/ScrollProgressTracker";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import ReadingProgressBanner from "./ReadingProgressBanner";

interface ReaderViewProps {
  bookmarkId: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly: boolean;
  progressBarStyle?: React.CSSProperties;
}

function ReaderView({
  bookmarkId,
  className,
  style,
  readOnly,
  progressBarStyle,
}: ReaderViewProps) {
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();
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

  // Reading progress
  const initialOffset = bookmark?.readingProgressOffset ?? null;
  const initialAnchor = bookmark?.readingProgressAnchor ?? null;

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [restoreRequested, setRestoreRequested] = useState(false);
  const hasSavedPosition =
    !!initialOffset && initialOffset > 0 && !bannerDismissed;

  const lastSavedOffset = useRef<number | null>(initialOffset);
  const { mutate: updateProgress } = useMutation(
    api.bookmarks.updateReadingProgress.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(api.bookmarks.getBookmark.pathFilter());
      },
    }),
  );

  const handlePositionChange = useCallback(
    (position: ReadingPosition) => {
      if (lastSavedOffset.current === position.offset) return;
      lastSavedOffset.current = position.offset;
      updateProgress({
        bookmarkId,
        readingProgressOffset: position.offset,
        readingProgressAnchor: position.anchor,
        readingProgressPercent: position.percent,
      });
    },
    [bookmarkId, updateProgress],
  );

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
      <ScrollProgressTracker
        onScrollProgress={handlePositionChange}
        restorePosition={restoreRequested}
        readingProgressOffset={initialOffset}
        readingProgressAnchor={initialAnchor}
        showProgressBar
        progressBarStyle={progressBarStyle}
      >
        {hasSavedPosition && (
          <ReadingProgressBanner
            percent={bookmark?.readingProgressPercent ?? null}
            onContinue={() => {
              setRestoreRequested(true);
              setBannerDismissed(true);
            }}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}
        <BookmarkHTMLHighlighter
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
      </ScrollProgressTracker>
    );
  }
  return content;
}

export default ReaderView;
