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
import { useClientConfig } from "@/lib/clientConfig";
import { useDoBookmarkSearch } from "@/lib/hooks/bookmark-search";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

import { useSearchHistory } from "@karakeep/shared-react/hooks/search-history";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";

import { EditListModal } from "../lists/EditListModal";
import QueryExplainerTooltip from "./QueryExplainerTooltip";
import { SearchModeSelector } from "./SearchModeSelector";
import { useSearchAutocomplete } from "./useSearchAutocomplete";

const SEARCH_PLACEHOLDERS = {
  fts: "search.keyword_placeholder",
  hybrid: "search.hybrid_placeholder",
  semantic: "search.semantic_placeholder",
} as const;

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
  const { semanticSearchEnabled } = useClientConfig().search;
  const {
    debounceSearch,
    searchQuery,
    doSearch,
    setSearchMode,
    searchMode,
    isInSearchPage,
  } = useDoBookmarkSearch();
  const { addTerm, history } = useSearchHistory({
    getItem: (k: string) => localStorage.getItem(k),
    setItem: (k: string, v: string) => localStorage.setItem(k, v),
    removeItem: (k: string) => localStorage.removeItem(k),
  });

  const [value, setValue] = useState(searchQuery);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [newNestedListModalOpen, setNewNestedListModalOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const isHistorySelected = useRef(false);
  const isComposing = useRef(false);

  const handleValueChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      // Only trigger debounced search if not in IME composition mode
      if (!isComposing.current) {
        debounceSearch(newValue);
      }
      isHistorySelected.current = false; // Reset flag when user types
    },
    [debounceSearch],
  );

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposing.current = false;
      // Trigger search with the final composed value
      const target = e.target as HTMLInputElement;
      debounceSearch(target.value);
    },
    [debounceSearch],
  );

  const {
    suggestionGroups,
    hasSuggestions,
    isPopoverVisible,
    handleSuggestionSelect,
    handleCommandKeyDown,
  } = useSearchAutocomplete({
    value,
    onValueChange: handleValueChange,
    inputRef,
    isPopoverOpen,
    setIsPopoverOpen,
    t,
    history,
  });

  const handleHistorySelect = useCallback(
    (term: string) => {
      isHistorySelected.current = true;
      setValue(term);
      doSearch(term);
      addTerm(term);
      setIsPopoverOpen(false);
      inputRef.current?.blur();
    },
    [doSearch, addTerm],
  );

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

  // Parse what's currently in the input rather than the query that's being
  // searched: the two diverge while typing, and when navigating away from the
  // search page the input is cleared but the last search query is kept around.
  const parsedValue = useMemo(() => parseSearchQuery(value), [value]);
  const canSaveSearch =
    parsedValue.result === "full" && parsedValue.text.length === 0;

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
      <div className="absolute inset-y-0 right-1.5 z-50 flex items-center gap-1">
        {canSaveSearch ? (
          <Button
            onClick={() => setNewNestedListModalOpen(true)}
            size="none"
            variant="secondary"
            className="h-7 px-2 text-xs"
          >
            {t("actions.save")}
          </Button>
        ) : null}
        <Link
          href="https://docs.karakeep.app/Guides/search-query-language"
          target="_blank"
          className="flex size-7 shrink-0 items-center justify-center rounded-md stroke-foreground transition-colors hover:bg-background/80"
        >
          <QueryExplainerTooltip
            parsedSearchQuery={parsedValue}
            className="text-muted-foreground"
          />
        </Link>
        {semanticSearchEnabled ? (
          <SearchModeSelector
            value={searchMode}
            onValueChange={(mode) => setSearchMode(mode, value)}
          />
        ) : null}
      </div>
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
                placeholder={t(SEARCH_PLACEHOLDERS[searchMode])}
                value={value}
                onValueChange={handleValueChange}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={cn(
                  "h-10",
                  semanticSearchEnabled ? "pr-20 sm:pr-36" : "pr-10",
                  canSaveSearch &&
                    (semanticSearchEnabled ? "pr-32 sm:pr-48" : "pr-24"),
                  className,
                )}
                {...props}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <CommandList className="max-h-96 overflow-y-auto">
              {hasSuggestions && <CommandItem value="-" className="hidden" />}
              {suggestionGroups.map((group) => (
                <CommandGroup key={group.id} heading={group.label}>
                  {group.items.map((item) => {
                    if (item.type === "history") {
                      return (
                        <CommandItem
                          key={item.id}
                          value={item.label}
                          onSelect={() => handleHistorySelect(item.term)}
                          onMouseDown={() => {
                            isHistorySelected.current = true;
                          }}
                          className="cursor-pointer"
                        >
                          <item.Icon className="mr-2 h-4 w-4" />
                          <span>{item.label}</span>
                        </CommandItem>
                      );
                    }

                    return (
                      <CommandItem
                        key={item.id}
                        value={item.label}
                        onSelect={() => handleSuggestionSelect(item)}
                        className="cursor-pointer"
                      >
                        <item.Icon className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span>{item.label}</span>
                          {item.description && (
                            <span className="text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </PopoverContent>
        </Popover>
      </Command>
    </div>
  );
});
SearchInput.displayName = "SearchInput";

export { SearchInput };
