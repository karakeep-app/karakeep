import { ReactNode } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

import { useDeleteHighlight } from "@karakeep/shared-react/hooks/highlights";
import { ZHighlight } from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "../preview/highlights";

export default function HighlightCard({
  highlight,
  clickable,
  className,
}: {
  highlight: ZHighlight;
  clickable: boolean;
  className?: string;
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

  function waitForElementInView(element: Element): Promise<void> {
    return new Promise((resolve) => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            observer.disconnect();
            resolve();
          }
        },
        {
          root: null,
          threshold: 0.5,
        },
      );

      observer.observe(element);
    });
  }

  function normalizeText(text: string | null): string {
    if (!text) return "";

    let normalized = text.replace(/\r\n/g, "\n");
    normalized = normalized.replace(/\r/g, "\n");

    normalized = normalized.replace(
      /[\t\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]+/g, // ignore all types of whitespace
      " ",
    );

    normalized = normalized.replace(/ +/g, " ");

    normalized = normalized.replace(/ *\n */g, "\n");

    normalized = normalized.replace(/\n{3,}/g, "\n\n");

    return normalized.trim();
  }
  const onBookmarkClick = () => {
    const elements = document.querySelectorAll(
      `[data-highlight-id="${highlight.id}"]`,
    );
    if (elements.length === 0) {
      return;
    }

    elements[0].scrollIntoView({ behavior: "smooth", block: "center" });

    waitForElementInView(elements[0]).then(() => {
      elements.forEach((el) => {
        el.classList.add(
          HIGHLIGHT_COLOR_MAP.bg[highlight.color].dark,
          "transition-colors",
          "duration-1000",
        );

        setTimeout(() => {
          el.classList.remove(HIGHLIGHT_COLOR_MAP.bg[highlight.color].dark);
        }, 1000);
      });
    });
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    clickable ? (
      <button onClick={onBookmarkClick}>{children}</button>
    ) : (
      <div>{children}</div>
    );

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <Wrapper>
        <blockquote
          cite={highlight.bookmarkId}
          className={cn(
            "prose border-l-[6px] p-2 pl-6 italic dark:prose-invert prose-p:text-sm",
            HIGHLIGHT_COLOR_MAP["border-l"][highlight.color],
          )}
        >
          {highlight.text?.includes("<img") ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-gray-500">
                [Image highlight]
              </p>
              <div
                className="whitespace-pre-line"
                dangerouslySetInnerHTML={{
                  __html: normalizeText(highlight.text) || "",
                }}
              />
            </div>
          ) : (
            <p className="whitespace-pre-line">
              {normalizeText(highlight.text)}
            </p>
          )}
        </blockquote>
      </Wrapper>
      <div className="flex gap-2">
        <ActionButton
          loading={isDeleting}
          title="Delete highlight"
          variant="ghost"
          className="rounded-full transition-all duration-200 hover:scale-105 hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={() => deleteHighlight({ highlightId: highlight.id })}
        >
          <Trash2 className="size-5 text-destructive" />
        </ActionButton>
      </div>
    </div>
  );
}
