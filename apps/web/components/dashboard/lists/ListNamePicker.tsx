"use client";

import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { selectTriggerClass } from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { listNameFromPath } from "@karakeep/shared/utils/listUtils";

/**
 * Picks several of your lists by name, the way `list:` matches them. The popover
 * stays open between picks and picking a selected list removes it.
 */
export function ListNamePicker({
  id,
  placeholder,
  selectedNames,
  onToggle,
  excludeListId,
}: {
  id?: string;
  placeholder: string;
  selectedNames: string[];
  onToggle: (name: string) => void;
  excludeListId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = useBookmarkLists();

  // `list:` only looks at lists you own
  const paths = (data?.allPaths ?? []).filter((path) => {
    const list = path[path.length - 1];
    return list.userRole === "owner" && list.id !== excludeListId;
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={selectTriggerClass}
        >
          <span className="truncate text-muted-foreground/85">
            {placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        // It sits in the right column, and opens wider than its trigger.
        align="end"
        collisionPadding={8}
        className="w-[--radix-popover-trigger-width] min-w-72 p-0"
        // The dialog around it would otherwise swallow the scrolling.
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput
            placeholder={t("lists.builder.lists_search_placeholder")}
            className="h-9 max-sm:h-11"
          />
          <CommandList className="max-h-60">
            <CommandEmpty>{t("lists.builder.lists_none_found")}</CommandEmpty>
            <CommandGroup>
              {paths.map((path) => {
                const list = path[path.length - 1];
                return (
                  <CommandItem
                    key={list.id}
                    value={list.id}
                    keywords={[list.name]}
                    onSelect={() => onToggle(list.name)}
                    className="cursor-pointer max-sm:min-h-11"
                  >
                    <Check
                      className={cn(
                        "size-4",
                        selectedNames.includes(list.name)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="truncate">{listNameFromPath(path)}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
