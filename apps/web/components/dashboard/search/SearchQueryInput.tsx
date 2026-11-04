"use client";

import React, { useCallback, useState } from "react";
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
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

import { useSearchAutocomplete } from "./useSearchAutocomplete";

type CommandInputProps = React.ComponentPropsWithoutRef<typeof CommandInput>;

interface SearchQueryInputProps extends Omit<
  CommandInputProps,
  "value" | "onValueChange" | "placeholder" | "className"
> {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  // When true, pressing Enter with no active suggestion submits the surrounding
  // form instead of just dismissing the popover.
  submitOnEnter?: boolean;
}

export const SearchQueryInput = React.forwardRef<
  HTMLInputElement,
  SearchQueryInputProps
>(
  (
    {
      value,
      onValueChange,
      placeholder,
      className,
      submitOnEnter = false,
      onKeyDown,
      onClick,
      ...inputProps
    },
    forwardedRef,
  ) => {
    const { t } = useTranslation();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    const handleInputKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(e);
        // Don't act on keydowns that commit an IME composition (e.g. Enter).
        if (e.nativeEvent.isComposing || e.keyCode === 229) {
          return;
        }
        if (e.key === "Home" || e.key === "End") {
          // cmdk's root handler preventDefaults Home/End to move the list
          // selection. In a text field, let the browser move the caret instead.
          e.stopPropagation();
          return;
        }
        if (e.key === "Enter" && submitOnEnter) {
          const selectedItem = document.querySelector(
            '[cmdk-item][data-selected="true"]',
          );
          const isPlaceholderSelected =
            selectedItem?.getAttribute("data-value") === "-";
          // With an active suggestion, let cmdk handle the selection. Otherwise
          // submit the surrounding form; cmdk would otherwise preventDefault and
          // swallow Enter.
          if (!selectedItem || isPlaceholderSelected) {
            e.preventDefault();
            setIsPopoverOpen(false);
            inputRef.current?.form?.requestSubmit();
          }
        }
      },
      [onKeyDown, submitOnEnter],
    );

    const {
      suggestionGroups,
      hasSuggestions,
      isPopoverVisible,
      handleSuggestionSelect,
      handleCommandKeyDown,
    } = useSearchAutocomplete({
      value,
      onValueChange,
      inputRef,
      isPopoverOpen,
      setIsPopoverOpen,
      t,
      history: [],
    });

    return (
      <div className="relative">
        <Command
          shouldFilter={false}
          className="relative rounded-md bg-transparent"
          onKeyDown={handleCommandKeyDown}
        >
          <Popover open={isPopoverVisible} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <CommandInput
                  ref={setInputRef}
                  placeholder={placeholder}
                  value={value}
                  onValueChange={onValueChange}
                  onFocus={() => setIsPopoverOpen(true)}
                  onKeyDown={handleInputKeyDown}
                  onClick={(e) => {
                    onClick?.(e);
                    // The input is inside PopoverTrigger, whose click toggles
                    // the popover. Keep clicks in the field from dismissing the
                    // open suggestions.
                    e.stopPropagation();
                  }}
                  className={cn("h-10", className)}
                  {...inputProps}
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
                    {group.items.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.label}
                        onSelect={() => {
                          if (item.type !== "history") {
                            handleSuggestionSelect(item);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <item.Icon className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span>{item.label}</span>
                          {item.type !== "history" && item.description && (
                            <span className="text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </PopoverContent>
          </Popover>
        </Command>
      </div>
    );
  },
);
SearchQueryInput.displayName = "SearchQueryInput";
