"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Command,
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
import { useDoBookmarkSearch } from "@/lib/hooks/bookmark-search";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";

import { useSearchHistory } from "@karakeep/shared-react/hooks/search-history";

import { EditListModal } from "../lists/EditListModal";
import QueryExplainerTooltip from "./QueryExplainerTooltip";

const MAX_DISPLAY_SUGGESTIONS = 5;

function useFocusSearchOnKeyPress(
  inputRef: React.RefObject<HTMLInputElement | null>,
  value: string,
  setValue: (value: string) => void,
  setPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>,
) {
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      if (!inputRef.current) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyK") {
        e.preventDefault();
        inputRef.current.focus();
        // Move the cursor to the end of the input field, so you can continue typing
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
        setPopoverOpen(true);
      }
      if (e.code === "Escape" && e.target == inputRef.current && value !== "") {
        e.preventDefault();
        inputRef.current.blur();
        setValue("");
      }
    }

    document.addEventListener("keydown", handleKeyPress);
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [inputRef, value, setValue, setPopoverOpen]);
}

const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.HTMLAttributes<HTMLInputElement> & { loading?: boolean }
>(({ className, ...props }, ref) => {
  const { t } = useTranslation();
  const {
    debounceSearch,
    searchQuery,
    doSearch,
    parsedSearchQuery,
    isInSearchPage,
  } = useDoBookmarkSearch();
  const { addTerm, history } = useSearchHistory({
    getItem: (k: string) => localStorage.getItem(k),
    setItem: (k: string, v: string) => localStorage.setItem(k, v),
    removeItem: (k: string) => localStorage.removeItem(k),
  });

  const [value, setValue] = React.useState(searchQuery);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [newNestedListModalOpen, setNewNestedListModalOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const isHistorySelected = useRef(false);

  const handleValueChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      debounceSearch(newValue);
      isHistorySelected.current = false; // Reset flag when user types
    },
    [debounceSearch],
  );

  const suggestions = useMemo(() => {
    if (value.trim() === "") {
      // Show recent items when not typing
      return history.slice(0, MAX_DISPLAY_SUGGESTIONS);
    } else {
      // Show filtered items when typing
      return history
        .filter((item) => item.toLowerCase().includes(value.toLowerCase()))
        .slice(0, MAX_DISPLAY_SUGGESTIONS);
    }
  }, [history, value]);

  const isPopoverVisible = isPopoverOpen && suggestions.length > 0;
  const handleHistorySelect = useCallback(
    (term: string) => {
      isHistorySelected.current = true;
      setValue(term);
      doSearch(term);
      addTerm(term);
      setIsPopoverOpen(false);
      inputRef.current?.blur();
    },
    [doSearch],
  );

  const handleCommandKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const selectedItem = document.querySelector(
        '[cmdk-item][data-selected="true"]',
      );
      const isPlaceholderSelected =
        selectedItem?.getAttribute("data-value") === "-";
      if (!selectedItem || isPlaceholderSelected) {
        e.preventDefault();
        setIsPopoverOpen(false);
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsPopoverOpen(false);
      inputRef.current?.blur();
    }
  }, []);

  useFocusSearchOnKeyPress(inputRef, value, setValue, setIsPopoverOpen);
  useImperativeHandle(ref, () => inputRef.current!);

  useEffect(() => {
    if (!isInSearchPage) {
      setValue("");
    }
  }, [isInSearchPage]);

  const handleFocus = useCallback(() => {
    setIsPopoverOpen(true);
  }, []);

  const handleBlur = useCallback(() => {
    // Only add to history if it wasn't a history selection
    if (value && !isHistorySelected.current) {
      addTerm(value);
    }

    // Reset the flag
    isHistorySelected.current = false;
    setIsPopoverOpen(false);
  }, [value, addTerm]);

  return (
    <div className={cn("relative flex-1", className)}>
      <EditListModal
        open={newNestedListModalOpen}
        setOpen={setNewNestedListModalOpen}
        prefill={{
          type: "smart",
          query: value,
        }}
      />
      <Link
        href="https://docs.karakeep.app/Guides/search-query-language"
        target="_blank"
        className="-translate-1/2 absolute right-1.5 top-2 z-50 stroke-foreground px-0.5"
      >
        <QueryExplainerTooltip parsedSearchQuery={parsedSearchQuery} />
      </Link>
      {parsedSearchQuery.result === "full" &&
        parsedSearchQuery.text.length == 0 && (
          <Button
            onClick={() => setNewNestedListModalOpen(true)}
            size="none"
            variant="secondary"
            className="absolute right-10 top-2 z-50 px-2 py-1 text-xs"
          >
            {t("actions.save")}
          </Button>
        )}
      <Command
        shouldFilter={false}
        className="relative rounded-md bg-transparent"
        onKeyDown={handleCommandKeyDown}
      >
        <Popover open={isPopoverVisible}>
          <PopoverTrigger asChild>
            <div className="relative">
              <CommandInput
                ref={inputRef}
                placeholder={t("common.search")}
                value={value}
                onValueChange={handleValueChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={cn("h-10", className)}
                {...props}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <CommandList>
              <CommandGroup
                heading={t("search.history")}
                className="max-h-60 overflow-y-auto"
              >
                {/* prevent cmdk auto select the first suggestion -> https://github.com/pacocoursey/cmdk/issues/171*/}
                <CommandItem value="-" className="hidden" />
                {suggestions.map((term) => (
                  <CommandItem
                    key={term}
                    value={term}
                    onSelect={() => handleHistorySelect(term)}
                    onMouseDown={() => {
                      isHistorySelected.current = true;
                    }}
                    className="cursor-pointer"
                  >
                    <History className="mr-2 h-4 w-4" />
                    <span>{term}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </PopoverContent>
        </Popover>
      </Command>
    </div>
  );
});
SearchInput.displayName = "SearchInput";

export { SearchInput };
