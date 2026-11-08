import { useEffect, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

import HighlightCard from "../highlights/HighlightCard";

export default function HighlightsBox({
  bookmarkId,
  readOnly,
}: {
  bookmarkId: string;
  readOnly: boolean;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  const { data: highlights, isPending: isLoading } = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId }),
  );

  // Someone who's just highlighted something gets to see it land here.
  const listRef = useRef<HTMLDivElement>(null);
  const knownIds = useRef<Set<string> | null>(null);
  const ids = highlights?.highlights.map((highlight) => highlight.id);
  const idsKey = ids?.join();
  useEffect(() => {
    if (!ids) {
      return;
    }
    const known = knownIds.current;
    knownIds.current = new Set(ids);
    const added = known && ids.find((id) => !known.has(id));
    if (!added) {
      return;
    }
    setIsOpen(true);
    // Once the section has opened, and in the layout that's showing.
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-highlight-row="${CSS.escape(added)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }, [idsKey]);

  if (isLoading || !highlights || highlights?.highlights.length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11">
          <span className="flex items-center gap-2">
            {t("common.highlights")}
            <span className="font-normal tabular-nums">
              {highlights.highlights.length}
            </span>
          </span>
          <ChevronRight
            className={cn("size-4 transition-transform", isOpen && "rotate-90")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent
          ref={listRef}
          className="flex flex-col gap-3 py-3 text-sm"
        >
          {highlights.highlights.map((highlight) => (
            <div key={highlight.id} data-highlight-row={highlight.id}>
              <HighlightCard
                highlight={highlight}
                clickable
                readOnly={readOnly}
              />
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
