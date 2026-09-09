import { ActionButton } from "@/components/ui/action-button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

import { useDeleteHighlight } from "@karakeep/shared-react/hooks/highlights";
import { useHighlightImages } from "@karakeep/shared-react/hooks/highlightImages";
import HighlightContent from "@karakeep/shared-react/components/HighlightContent";
import { ZHighlight } from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "../preview/highlights";

export default function HighlightCard({
  highlight,
  clickable,
  className,
  readOnly,
}: {
  highlight: ZHighlight;
  clickable: boolean;
  className?: string;
  readOnly: boolean;
}) {
  const { allowImages, hasBlockedImages, loadImages } =
    useHighlightImages(highlight);
  const { mutate: deleteHighlight, isPending: isDeleting } = useDeleteHighlight(
    {
      onSuccess: () => {
        toast({
          description: "Highlight has been deleted!",
        });
      },
      onError: () => {
        toast({
          description: "Something went wrong",
          variant: "destructive",
        });
      },
    },
  );

  const onBookmarkClick = () => {
    document
      .querySelector(`[data-highlight-id="${highlight.id}"]`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  };

  const Wrapper = ({
    className,
    children,
  }: {
    className?: string;
    children: React.ReactNode;
  }) =>
    clickable ? (
      <button className={className} onClick={onBookmarkClick}>
        {children}
      </button>
    ) : (
      <div className={className}>{children}</div>
    );

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <Wrapper className="flex flex-col gap-2 text-left">
        <blockquote
          cite={highlight.bookmarkId}
          className={cn(
            "prose border-l-[6px] p-2 pl-6 italic dark:prose-invert prose-p:text-sm",
            HIGHLIGHT_COLOR_MAP["border-l"][highlight.color],
          )}
        >
          <HighlightContent
            content={highlight.content}
            text={highlight.text}
            allowImages={allowImages}
          />
        </blockquote>
        {highlight.note && (
          <span className="text-sm text-muted-foreground">
            {highlight.note}
          </span>
        )}
      </Wrapper>
      {hasBlockedImages && (
        <button
          type="button"
          className="text-sm underline"
          onClick={loadImages}
        >
          Load shared images (contacts external sites)
        </button>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <ActionButton
            loading={isDeleting}
            variant="ghost"
            onClick={() => deleteHighlight({ highlightId: highlight.id })}
          >
            <Trash2 className="size-4 text-destructive" />
          </ActionButton>
        </div>
      )}
    </div>
  );
}
