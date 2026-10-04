import { Fragment } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

import { imageReferencesFromHighlightText } from "@karakeep/shared/utils/highlightUtils";
import { useDeleteHighlight } from "@karakeep/shared-react/hooks/highlights";
import { ZHighlight } from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "../preview/highlights";

const IMAGE_TOKEN_PATTERN = /\[\[karakeep-image:[^\]]+\]\]/g;

function renderHighlightText(text: string | null) {
  if (!text) {
    return null;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let imageIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = IMAGE_TOKEN_PATTERN.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    const image = imageReferencesFromHighlightText(token)[0];
    if (image) {
      nodes.push(
        // Highlight images retain the source dimensions from the bookmark.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`highlight-image-${imageIndex++}`}
          src={image.src}
          alt={image.alt || "Highlighted image"}
          className="my-1 inline-block max-h-64 max-w-full rounded object-contain align-middle"
        />,
      );
    } else {
      nodes.push(token);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
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
          <div className="whitespace-pre-wrap">
            {renderHighlightText(highlight.text)}
          </div>
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
