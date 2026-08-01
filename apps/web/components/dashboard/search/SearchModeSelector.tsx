"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Blend, BrainCircuit, ChevronDown, TextSearch } from "lucide-react";

import type { ZBookmarkSearchMode } from "@karakeep/shared/types/bookmarks";

const SEARCH_MODES = [
  {
    value: "fts",
    labelKey: "search.mode_keyword",
    descriptionKey: "search.mode_keyword_description",
    Icon: TextSearch,
  },
  {
    value: "hybrid",
    labelKey: "search.mode_hybrid",
    descriptionKey: "search.mode_hybrid_description",
    Icon: Blend,
    experimental: true,
  },
  {
    value: "semantic",
    labelKey: "search.mode_semantic",
    descriptionKey: "search.mode_semantic_description",
    Icon: BrainCircuit,
    experimental: true,
  },
] as const;

export function SearchModeSelector({
  value,
  onValueChange,
}: {
  value: ZBookmarkSearchMode;
  onValueChange: (value: ZBookmarkSearchMode) => void;
}) {
  const { t } = useTranslation();
  const activeMode =
    SEARCH_MODES.find((mode) => mode.value === value) ?? SEARCH_MODES[0];
  const ActiveIcon = activeMode.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="none"
          size="none"
          aria-label={t("search.mode_label")}
          className={cn(
            "group h-7 gap-1.5 rounded-md border px-2 text-xs shadow-sm transition-colors",
            value === "fts"
              ? "border-border/60 bg-background/75 text-muted-foreground hover:bg-background hover:text-foreground"
              : "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          <ActiveIcon className="size-3.5" />
          <span className="hidden sm:inline">{t(activeMode.labelKey)}</span>
          <ChevronDown className="size-3 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <DropdownMenuLabel className="px-2 pb-2 pt-1">
          <span className="block text-sm">{t("search.mode_label")}</span>
          <span className="mt-0.5 block font-normal text-muted-foreground">
            {t("search.mode_label_description")}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            const mode = SEARCH_MODES.find(
              (option) => option.value === nextValue,
            );
            if (mode) {
              onValueChange(mode.value);
            }
          }}
        >
          {SEARCH_MODES.map((mode) => (
            <DropdownMenuRadioItem
              key={mode.value}
              value={mode.value}
              className="items-start rounded-md py-2.5 pl-8 pr-2"
            >
              <mode.Icon
                className={cn(
                  "mr-2 mt-0.5 size-4",
                  value === mode.value
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  {t(mode.labelKey)}
                  {"experimental" in mode && mode.experimental ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {t("common.experimental")}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {t(mode.descriptionKey)}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
