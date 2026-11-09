"use client";

import { useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBookmarkSearchState } from "@/lib/hooks/bookmark-search";
import { useTranslation } from "@/lib/i18n/client";
import { useInSearchPageStore } from "@/lib/store/useInSearchPageStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { useSortOrder } from "@/lib/userLocalSettings/bookmarksLayout";
import { updateSortOrder } from "@/lib/userLocalSettings/userLocalSettings";
import { Check, ListFilter, SortAsc, SortDesc } from "lucide-react";

import type { ZSortOrder } from "@karakeep/shared/types/bookmarks";

export default function SortOrderToggle() {
  const { t } = useTranslation();
  const isInSearchPage = useInSearchPageStore((state) => state.inSearchPage);
  const { effectiveSearchMode } = useBookmarkSearchState();

  const defaultSortOrder = useSortOrder();
  const { sortOrder: overrideSortOrder, setSortOrder } = useSortOrderStore();
  const currentSort = overrideSortOrder ?? defaultSortOrder;
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!isInSearchPage && currentSort === "relevance") {
      setSortOrder(null);
    }
  }, [isInSearchPage, currentSort, setSortOrder]);

  const handleSortOrderChange = (nextSortOrder: ZSortOrder) => {
    setSortOrder(nextSortOrder);
    if (nextSortOrder !== "relevance") {
      startTransition(async () => {
        await updateSortOrder(nextSortOrder);
      });
    }
  };

  if (isInSearchPage && effectiveSearchMode !== "fts") {
    return null;
  }

  return (
    <DropdownMenu>
      {/* The tooltip goes outside the menu's trigger, which cancels the pointer
          press the tooltip closes on, so it sees the press first. */}
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label={t("actions.sort.title")}>
              {currentSort === "relevance" && (
                <ListFilter className="size-[18px]" size={18} />
              )}
              {currentSort === "asc" && (
                <SortAsc className="size-[18px]" size={18} />
              )}
              {currentSort === "desc" && (
                <SortDesc className="size-[18px]" size={18} />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{t("actions.sort.title")}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <DropdownMenuContent className="w-fit">
        {isInSearchPage && (
          <DropdownMenuItem
            className="cursor-pointer justify-between"
            onClick={() => handleSortOrderChange("relevance")}
          >
            <div className="flex items-center">
              <ListFilter size={16} className="mr-2" />
              <span>{t("actions.sort.relevant_first")}</span>
            </div>
            {currentSort === "relevance" && <Check className="ml-2 h-4 w-4" />}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="cursor-pointer justify-between"
          onClick={() => handleSortOrderChange("desc")}
        >
          <div className="flex items-center">
            <SortDesc size={16} className="mr-2" />
            <span>{t("actions.sort.newest_first")}</span>
          </div>
          {currentSort === "desc" && <Check className="ml-2 h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer justify-between"
          onClick={() => handleSortOrderChange("asc")}
        >
          <div className="flex items-center">
            <SortAsc size={16} className="mr-2" />
            <span>{t("actions.sort.oldest_first")}</span>
          </div>
          {currentSort === "asc" && <Check className="ml-2 h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
