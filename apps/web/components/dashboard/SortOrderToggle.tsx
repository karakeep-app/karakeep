"use client";

import { useEffect } from "react";
import { ButtonWithTooltip } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/client";
import { useInSearchPageStore } from "@/lib/store/useInSearchPageStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { Check, ListFilter, SortAsc, SortDesc } from "lucide-react";

export default function SortOrderToggle() {
  const { t } = useTranslation();
  const isInSearchPage = useInSearchPageStore();

  const { sortOrder: currentSort, setSortOrder } = useSortOrderStore();

  // also see related on page enter sortOrder.relevance init
  // in apps/web/app/dashboard/search/page.tsx
  useEffect(() => {
    if (!isInSearchPage && currentSort === "relevance") {
      // reset to default sort order
      setSortOrder("desc");
    }
  }, [isInSearchPage, currentSort]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ButtonWithTooltip
          tooltip={t("actions.sort.title")}
          delayDuration={100}
          variant="ghost"
        >
          {currentSort === "relevance" && <ListFilter size={18} />}
          {currentSort === "asc" && <SortAsc size={18} />}
          {currentSort === "desc" && <SortDesc size={18} />}
        </ButtonWithTooltip>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-fit">
        {isInSearchPage && (
          <DropdownMenuItem
            className="cursor-pointer justify-between"
            onClick={() => setSortOrder("relevance")}
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
          onClick={() => setSortOrder("desc")}
        >
          <div className="flex items-center">
            <SortDesc size={16} className="mr-2" />
            <span>{t("actions.sort.newest_first")}</span>
          </div>
          {currentSort === "desc" && <Check className="ml-2 h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer justify-between"
          onClick={() => setSortOrder("asc")}
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
