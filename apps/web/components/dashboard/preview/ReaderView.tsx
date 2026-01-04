import { forwardRef, useEffect } from "react";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/trpc";

import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import BookmarkHTMLHighlighter from "./BookmarkHtmlHighlighter";

interface ReaderViewProps {
  bookmarkId: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly: boolean;
  onContentReady?: () => void;
}

const ReaderView = forwardRef<HTMLDivElement, ReaderViewProps>(
  function ReaderView(
    { bookmarkId, className, style, readOnly, onContentReady },
    ref,
  ) {
    const { data: highlights } = api.highlights.getForBookmark.useQuery({
      bookmarkId,
    });
    const { data: cachedContent, isPending: isCachedContentLoading } =
      api.bookmarks.getBookmark.useQuery(
        {
          bookmarkId,
          includeContent: true,
        },
        {
          select: (data) =>
            data.content.type == BookmarkTypes.LINK
              ? data.content.htmlContent
              : null,
        },
      );

    // Signal to parent when content is ready for reading progress restoration
    useEffect(() => {
      if (!isCachedContentLoading && cachedContent && onContentReady) {
        onContentReady();
      }
    }, [isCachedContentLoading, cachedContent, onContentReady]);

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
    } else if (!cachedContent) {
      content = (
        <div className="text-destructive">Failed to fetch link content ...</div>
      );
    } else {
      content = (
        <BookmarkHTMLHighlighter
          ref={ref}
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
              note: h.note ?? null,
            })
          }
        />
      );
    }
    return content;
  },
);

export default ReaderView;
