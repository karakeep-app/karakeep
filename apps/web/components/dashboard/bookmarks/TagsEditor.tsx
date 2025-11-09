import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useClientConfig } from "@/lib/clientConfig";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { Check, Loader2, Plus, Sparkles, X } from "lucide-react";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";

export function TagsEditor({
  tags: _tags,
  onAttach,
  onDetach,
}: {
  tags: ZBookmarkTags[];
  onAttach: (tag: { tagName: string; tagId?: string }) => void;
  onDetach: (tag: { tagName: string; tagId: string }) => void;
}) {
  const demoMode = !!useClientConfig().demoMode;
  const isDisabled = demoMode;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [optimisticTags, setOptimisticTags] = useState<ZBookmarkTags[]>(_tags);
  const tempIdCounter = React.useRef(0);

  const generateTempId = React.useCallback(() => {
    tempIdCounter.current += 1;
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return `temp-${crypto.randomUUID()}`;
    }

    return `temp-${Date.now()}-${tempIdCounter.current}`;
  }, []);

  React.useEffect(() => {
    setOptimisticTags((prev) => {
      let results = prev;
      for (const tag of _tags) {
        const idx = results.findIndex((t) => t.name === tag.name);
        if (idx == -1) {
          results.push(tag);
          continue;
        }
        if (results[idx].id.startsWith("temp-")) {
          results[idx] = tag;
          continue;
        }
      }
      return results;
    });
  }, [_tags]);

  const { data: filteredOptions, isLoading: isExistingTagsLoading } =
    api.tags.list.useQuery(
      {
        nameContains: inputValue,
        limit: 50,
        sortBy: inputValue.length > 0 ? "relevance" : "usage",
      },
      {
        select: (data) =>
          data.tags.map((t) => ({
            id: t.id,
            name: t.name,
            attachedBy:
              (t.numBookmarksByAttachedType.human ?? 0) > 0
                ? ("human" as const)
                : ("ai" as const),
          })),
        placeholderData: keepPreviousData,
        gcTime: inputValue.length > 0 ? 60_000 : 3_600_000,
      },
    );

  const selectedValues = optimisticTags.map((tag) => tag.id);

  // Add "create new" option if input doesn't match any existing option
  const trimmedInputValue = inputValue.trim();

  interface DisplayOption {
    id: string;
    name: string;
    label: string;
    attachedBy: "human" | "ai";
    isCreateOption?: boolean;
  }

  const displayedOptions = React.useMemo<DisplayOption[]>(() => {
    if (!filteredOptions) return [];

    const baseOptions = filteredOptions.map((option) => ({
      ...option,
      label: option.name,
    }));

    if (!trimmedInputValue) {
      return baseOptions;
    }

    const exactMatch = baseOptions.some(
      (opt) => opt.name.toLowerCase() === trimmedInputValue.toLowerCase(),
    );

    if (!exactMatch) {
      return [
        {
          id: "create-new",
          name: trimmedInputValue,
          label: `Create "${trimmedInputValue}"`,
          attachedBy: "human" as const,
          isCreateOption: true,
        },
        ...baseOptions,
      ];
    }

    return baseOptions;
  }, [filteredOptions, trimmedInputValue]);

  const onChange = (
    actionMeta:
      | { action: "create-option"; name: string }
      | { action: "select-option"; id: string; name: string }
      | {
          action: "remove-value";
          id: string;
          name: string;
        },
  ) => {
    switch (actionMeta.action) {
      case "remove-value": {
        setOptimisticTags((prev) => prev.filter((t) => t.id != actionMeta.id));
        onDetach({
          tagId: actionMeta.id,
          tagName: actionMeta.name,
        });
        break;
      }
      case "create-option": {
        const tempId = generateTempId();
        setOptimisticTags((prev) => [
          ...prev,
          {
            id: tempId,
            name: actionMeta.name,
            attachedBy: "human" as const,
          },
        ]);
        onAttach({ tagName: actionMeta.name });
        break;
      }
      case "select-option": {
        setOptimisticTags((prev) => {
          if (prev.some((tag) => tag.id === actionMeta.id)) {
            return prev;
          }

          return [
            ...prev,
            {
              id: actionMeta.id,
              name: actionMeta.name,
              attachedBy: "human" as const,
            },
          ];
        });
        onAttach({
          tagName: actionMeta.name,
          tagId: actionMeta.id,
        });
        break;
      }
    }
  };

  const createTag = () => {
    if (!inputValue.trim()) return;
    onChange({ action: "create-option", name: inputValue.trim() });
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (
      e.key === "Backspace" &&
      !inputValue &&
      optimisticTags.length > 0
    ) {
      const lastTag = optimisticTags.slice(-1)[0];
      onChange({
        action: "remove-value",
        id: lastTag.id,
        name: lastTag.name,
      });
    }
  };

  const handleSelect = (option: DisplayOption) => {
    if (option.isCreateOption) {
      onChange({ action: "create-option", name: option.name });
      setInputValue("");
      inputRef.current?.focus();
      return;
    }

    // If already selected, remove it
    if (selectedValues.includes(option.id)) {
      onChange({
        action: "remove-value",
        id: option.id,
        name: option.name,
      });
    } else {
      // Add the new tag
      onChange({
        action: "select-option",
        id: option.id,
        name: option.name,
      });
    }

    // Reset input and keep focus
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (open) {
      // Focus the input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  return (
    <div ref={containerRef} className="w-full">
      <Popover open={open && !isDisabled} onOpenChange={handleOpenChange}>
        <Command shouldFilter={false}>
          <PopoverTrigger asChild>
            <div
              className={cn(
                "relative flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              {optimisticTags.length > 0 && (
                <>
                  {optimisticTags.map((tag) => (
                    <div
                      key={tag.id}
                      className={cn(
                        "flex min-h-8 space-x-1 rounded px-2",
                        tag.attachedBy == "ai"
                          ? "bg-gradient-to-tr from-purple-500 to-purple-400 text-white"
                          : "bg-accent",
                      )}
                    >
                      <div className="m-auto flex gap-2">
                        {tag.attachedBy === "ai" && (
                          <Sparkles className="m-auto size-4" />
                        )}
                        {tag.name}
                        {!isDisabled && (
                          <button
                            type="button"
                            className="rounded-full outline-none ring-offset-background focus:ring-1 focus:ring-ring focus:ring-offset-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              onChange({
                                action: "remove-value",
                                id: tag.id,
                                name: tag.name,
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove {tag.name}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
              <CommandPrimitive.Input
                ref={inputRef}
                value={inputValue}
                onKeyDown={handleKeyDown}
                onValueChange={(v) => setInputValue(v)}
                className="bg-transparent outline-none placeholder:text-muted-foreground"
                style={{ width: `${Math.max(inputValue.length, 1)}ch` }}
                disabled={isDisabled}
              />
              {isExistingTagsLoading && (
                <div className="absolute bottom-2 right-2">
                  <Loader2 className="h-4 w-4 animate-spin opacity-50" />
                </div>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <CommandList className="max-h-64">
              {displayedOptions.length === 0 ? (
                <CommandEmpty>
                  {trimmedInputValue ? (
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span>Create &quot;{trimmedInputValue}&quot;</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={createTag}
                        className="h-auto p-1"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    "No tags found."
                  )}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {displayedOptions.map((option) => {
                    const isSelected = selectedValues.includes(option.id);
                    return (
                      <CommandItem
                        key={
                          option.isCreateOption
                            ? `create-${option.name}`
                            : option.id
                        }
                        value={option.label}
                        onSelect={() => handleSelect(option)}
                      >
                        <div className="flex w-full items-center gap-2">
                          {option.isCreateOption ? (
                            <Plus className="h-4 w-4" />
                          ) : (
                            <Check
                              className={cn(
                                "h-4 w-4",
                                isSelected ? "opacity-100" : "opacity-0",
                              )}
                            />
                          )}
                          <span>{option.name}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </PopoverContent>
        </Command>
      </Popover>
    </div>
  );
}
