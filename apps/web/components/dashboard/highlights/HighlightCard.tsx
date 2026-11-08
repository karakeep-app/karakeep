import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import LoadingSpinner from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

import { ZHighlight } from "@karakeep/shared/types/highlights";

import { flashHighlight, HIGHLIGHT_COLOR_MAP } from "../preview/highlights";
import {
  DESTRUCTIVE_ICON_CONTROL_CLASS,
  ICON_CONTROL_CLASS,
  IconTooltip,
} from "../preview/IconControl";
import { useDeleteHighlightWithUndo } from "./useDeleteHighlightWithUndo";

const INTERACTIVE_QUOTE_CLASS =
  "rounded-r-md outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 [@media(hover:hover)]:hover:bg-accent/50";

function Wrapper({
  className,
  href,
  onClick,
  children,
}: {
  className?: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} className={cn(INTERACTIVE_QUOTE_CLASS, className)}>
        {children}
      </Link>
    );
  }
  return onClick ? (
    <button
      className={cn(INTERACTIVE_QUOTE_CLASS, className)}
      onClick={onClick}
    >
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  );
}

export default function HighlightCard({
  highlight,
  clickable,
  href,
  className,
  readOnly,
  meta,
}: {
  highlight: ZHighlight;
  /** Scrolls to the highlight in the article on the same page. */
  clickable: boolean;
  /** Where the quote leads, for when the article isn't on this page. */
  href?: string;
  className?: string;
  readOnly: boolean;
  /** Secondary details shown under the quote, inside the coloured rule. */
  meta?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { mutate: deleteHighlight, isPending: isDeleting } =
    useDeleteHighlightWithUndo();

  const onBookmarkClick = () => {
    // The preview mounts both its wide and narrow layouts, so skip the hidden copy.
    const spans = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-highlight-id="${highlight.id}"]`,
      ),
    ).filter((el) => el.offsetParent !== null);
    spans[0]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    flashHighlight(highlight.id);
  };

  return (
    <div
      className={cn(
        "group/highlight flex items-start justify-between gap-2",
        className,
      )}
    >
      <Wrapper
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1 border-l-4 pl-3 text-left",
          HIGHLIGHT_COLOR_MAP["border-l"][highlight.color],
        )}
        href={href}
        onClick={clickable ? onBookmarkClick : undefined}
      >
        <blockquote
          cite={highlight.bookmarkId}
          className="whitespace-pre-line break-words text-[15px] leading-relaxed text-foreground"
        >
          {highlight.text}
        </blockquote>
        {highlight.note && (
          <span className="break-words text-sm text-muted-foreground">
            {highlight.note}
          </span>
        )}
        {meta}
      </Wrapper>
      {!readOnly && (
        <IconTooltip label={t("highlights.delete")}>
          <ActionButton
            loading={isDeleting}
            spinner={<LoadingSpinner className="size-4" />}
            variant="ghost"
            size="none"
            aria-label={t("highlights.delete")}
            className={cn(
              ICON_CONTROL_CLASS,
              DESTRUCTIVE_ICON_CONTROL_CLASS,
              "shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 disabled:opacity-100 group-focus-within/highlight:opacity-100 group-hover/highlight:opacity-100 [@media(hover:none)]:opacity-100",
            )}
            onClick={() => deleteHighlight({ highlightId: highlight.id })}
          >
            <Trash2 className="size-4" />
          </ActionButton>
        </IconTooltip>
      )}
    </div>
  );
}
