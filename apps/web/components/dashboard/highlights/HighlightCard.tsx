import { ActionButton } from "@/components/ui/action-button";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

import { ZHighlight } from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "../preview/highlights";
import { useDeleteHighlightWithUndo } from "./useDeleteHighlightWithUndo";

function Wrapper({
  className,
  onClick,
  children,
}: {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return onClick ? (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  );
}

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
  const { mutate: deleteHighlight, isPending: isDeleting } =
    useDeleteHighlightWithUndo();

  const onBookmarkClick = () => {
    document
      .querySelector(`[data-highlight-id="${highlight.id}"]`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  };

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <Wrapper
        className="flex flex-col gap-2 text-left"
        onClick={clickable ? onBookmarkClick : undefined}
      >
        <blockquote
          cite={highlight.bookmarkId}
          className={cn(
            "prose border-l-[6px] p-2 pl-6 italic dark:prose-invert prose-p:text-sm",
            HIGHLIGHT_COLOR_MAP["border-l"][highlight.color],
          )}
        >
          <p>{highlight.text}</p>
        </blockquote>
        {highlight.note && (
          <span className="text-sm text-muted-foreground">
            {highlight.note}
          </span>
        )}
      </Wrapper>
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
