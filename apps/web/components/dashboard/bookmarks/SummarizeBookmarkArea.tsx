import React from "react";
import SidebarSectionHeading from "@/components/shared/sidebar/SidebarSectionHeading";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ChevronUp, RefreshCw, Sparkles, Trash2 } from "lucide-react";

import {
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import {
  DESTRUCTIVE_ICON_CONTROL_CLASS,
  ICON_CONTROL_CLASS,
  IconTooltip,
} from "../preview/IconControl";

function AISummary({
  bookmarkId,
  summary,
  readOnly = false,
  canResummarize = true,
}: {
  bookmarkId: string;
  summary: string;
  readOnly?: boolean;
  canResummarize?: boolean;
}) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { mutate: resummarize, isPending: isResummarizing } =
    useSummarizeBookmark({
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    });
  const { mutate: updateBookmark, isPending: isUpdatingBookmark } =
    useUpdateBookmark({
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    });
  return (
    <div className="flex w-full flex-col gap-1.5">
      <SidebarSectionHeading>{t("common.summary")}</SidebarSectionHeading>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={cn(
          "relative overflow-hidden rounded-md transition-all duration-300 ease-in-out [&_a]:inline-block [&_a]:max-w-full [&_a]:truncate [&_a]:align-bottom",
          isExpanded ? "h-auto" : "cursor-pointer",
        )}
        onClick={() => !isExpanded && setIsExpanded(true)}
      >
        <div className="h-full rounded-md bg-muted p-2">
          <MarkdownReadonly
            className={`text-sm ${!isExpanded && "line-clamp-3"}`}
          >
            {summary}
          </MarkdownReadonly>
          {isExpanded && (
            <span className="flex justify-end gap-0.5 pt-2">
              {!readOnly && (
                <>
                  {canResummarize && (
                    <IconTooltip label={t("actions.resummarize")}>
                      <ActionButton
                        variant="ghost"
                        size="none"
                        spinner={<LoadingSpinner className="size-4" />}
                        className={ICON_CONTROL_CLASS}
                        aria-label={t("actions.resummarize")}
                        loading={isResummarizing}
                        onClick={() => resummarize({ bookmarkId })}
                      >
                        <RefreshCw className="size-4" />
                      </ActionButton>
                    </IconTooltip>
                  )}
                  <IconTooltip label={t("actions.delete_summary")}>
                    <ActionButton
                      variant="ghost"
                      size="none"
                      spinner={<LoadingSpinner className="size-4" />}
                      className={cn(
                        ICON_CONTROL_CLASS,
                        DESTRUCTIVE_ICON_CONTROL_CLASS,
                      )}
                      aria-label={t("actions.delete_summary")}
                      loading={isUpdatingBookmark}
                      onClick={() =>
                        updateBookmark({ bookmarkId, summary: null })
                      }
                    >
                      <Trash2 className="size-4" />
                    </ActionButton>
                  </IconTooltip>
                </>
              )}
              <IconTooltip label={t("actions.collapse")}>
                <Button
                  variant="ghost"
                  size="none"
                  className={ICON_CONTROL_CLASS}
                  aria-label={t("actions.collapse")}
                  onClick={() => setIsExpanded(false)}
                >
                  <ChevronUp className="size-4" />
                </Button>
              </IconTooltip>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SummarizeBookmarkArea({
  bookmark,
  readOnly = false,
}: {
  bookmark: ZBookmark;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate, isPending } = useSummarizeBookmark({
    onError: () => {
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
    },
  });

  const clientConfig = useClientConfig();
  if (bookmark.summary) {
    return (
      <AISummary
        bookmarkId={bookmark.id}
        summary={bookmark.summary}
        readOnly={readOnly}
        canResummarize={bookmark.content.type === BookmarkTypes.LINK}
      />
    );
  } else if (
    bookmark.content.type !== BookmarkTypes.LINK ||
    !clientConfig.inference.isConfigured ||
    readOnly
  ) {
    return null;
  } else {
    return (
      <div className="flex w-full items-center gap-4">
        <ActionButton
          onClick={() => mutate({ bookmarkId: bookmark.id })}
          variant="secondary"
          className={cn(
            `w-full text-muted-foreground transition-all duration-300 hover:text-foreground`,
          )}
          loading={isPending}
        >
          <span className="flex items-center gap-1.5">
            {t("actions.summarize_with_ai")}
            <Sparkles className="size-4" />
          </span>
        </ActionButton>
      </div>
    );
  }
}
