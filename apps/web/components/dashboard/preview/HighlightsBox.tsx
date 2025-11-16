import React, { Fragment } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { Separator } from "@radix-ui/react-separator";
import { ChevronsDownUp } from "lucide-react";

import HighlightCard from "../highlights/HighlightCard";

export default function HighlightsBox({ bookmarkId }: { bookmarkId: string }) {
  const { t } = useTranslation();

  const { data: highlightsData, isPending: isLoading } =
    api.highlights.getForBookmark.useQuery({ bookmarkId });

  const highlightsList = highlightsData?.highlights;

  if (isLoading || !highlightsList || highlightsList.length === 0) {
    return null;
  }

  return (
    <Collapsible defaultOpen={true}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm text-gray-400">
        {t("common.highlights")}
        <ChevronsDownUp className="size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="group flex flex-col py-3 text-sm">
        {highlightsList.map((highlight) => (
          <Fragment key={highlight.id}>
            <HighlightCard highlight={highlight} clickable />
            <Separator className="m-2 h-0.5 bg-gray-200 last:hidden data-[orientation=horizontal]:h-px data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px" />
          </Fragment>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
