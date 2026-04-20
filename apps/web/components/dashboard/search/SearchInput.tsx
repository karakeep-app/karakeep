"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
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

import { useSearchHistory } from "@karakeep/shared-react/hooks/search-history";

import { EditListModal } from "../lists/EditListModal";
import QueryExplainerTooltip from "./QueryExplainerTooltip";
import { useSearchAutocomplete } from "./useSearchAutocomplete";

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
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
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
