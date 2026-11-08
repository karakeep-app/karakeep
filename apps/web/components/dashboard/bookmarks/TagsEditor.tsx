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
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { isServer, keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { Check, Loader2, Plus, Sparkles, X } from "lucide-react";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";
import { useTRPC } from "@karakeep/shared-react/trpc";

import { IconTooltip } from "../preview/IconControl";

export function TagsEditor({
  tags: _tags,
  onAttach,
  onDetach,
  disabled,
  allowCreation = true,
  placeholder,
  variant = "field",
  addOnly = false,
}: {
  tags: ZBookmarkTags[];
  onAttach: (tag: { tagName: string; tagId?: string }) => void;
  onDetach: (tag: { tagName: string; tagId: string }) => void;
  disabled?: boolean;
  allowCreation?: boolean;
  placeholder?: string;
  /**
   * "inline" drops the input's box for a borderless "+ Add tag" control in line
   * with the chips, where the control itself is the input, so typing works from
   * the first keystroke.
   */
  variant?: "field" | "inline";
  /**
   * Only for adding, for when what's attached is shown elsewhere: no chips, and
   * picking a tag always adds it.
   */
  addOnly?: boolean;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const demoMode = !!useClientConfig().demoMode;
  const isDisabled = demoMode || disabled;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [attachedTags, setOptimisticTags] = useState<ZBookmarkTags[]>(_tags);
  const optimisticTags = addOnly ? [] : attachedTags;
  const tempIdCounter = React.useRef(0);
  const hasInitializedRef = React.useRef(_tags.length > 0);

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
    // When allowCreation is false, only sync on initial load
    // After that, rely on optimistic updates to avoid re-ordering
    if (!allowCreation) {
      if (!hasInitializedRef.current && _tags.length > 0) {
        hasInitializedRef.current = true;
        setOptimisticTags(_tags);
      }
      return;
    }

    // For allowCreation mode, sync server state with optimistic state
    setOptimisticTags((prev) => {
      // Start with a copy to avoid mutating the previous state
      const results = [...prev];
      let changed = false;

      for (const tag of _tags) {
        const idx = results.findIndex((t) => t.name === tag.name);
        if (idx == -1) {
          results.push(tag);
          changed = true;
          continue;
        }
        if (results[idx].id.startsWith("temp-")) {
          results[idx] = tag;
          changed = true;
          continue;
        }
      }

      return changed ? results : prev;
    });
  }, [_tags, allowCreation]);

  const { data: filteredOptions, isLoading: isExistingTagsLoading } = useQuery(
    api.tags.list.queryOptions(
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
        // A finite gcTime on the server schedules a timer that pins the
        // request's query cache in memory; keep the default (Infinity) there.
        gcTime: isServer
          ? Infinity
          : inputValue.length > 0
            ? 60_000
            : 3_600_000,
      },
    ),
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

    const query = trimmedInputValue.toLowerCase();
    const rank = (name: string) => {
      const lowerName = name.toLowerCase();
      if (lowerName === query) return 0;
      if (lowerName.startsWith(query)) return 1;
      return 2;
    };
    // The list shows the previous query's results while the new ones load.
    // Drop what no longer matches: the top row gets pre-selected, so Enter
    // would otherwise attach an unrelated tag.
    const matches = baseOptions
      .filter((opt) => opt.name.toLowerCase().includes(query))
      .sort((a, b) => rank(a.name) - rank(b.name));

    const exactMatch = matches.some((opt) => rank(opt.name) === 0);

    if (!exactMatch && allowCreation) {
      return [
        ...matches,
        {
          id: "create-new",
          name: trimmedInputValue,
          label: t("tags.create_named", { name: trimmedInputValue }),
          attachedBy: "human" as const,
          isCreateOption: true,
        },
      ];
    }

    return matches;
  }, [filteredOptions, trimmedInputValue, allowCreation, t]);

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

  const renderChip = (
    tag: ZBookmarkTags,
    chipClassName: string,
    removeClassName: string,
  ) => (
    <div key={tag.id} className={chipClassName}>
      <div className="m-auto flex min-w-0 items-center gap-1">
        {tag.attachedBy === "ai" && (
          <Sparkles
            className={cn(
              "size-4 shrink-0",
              variant === "inline" && "text-muted-foreground",
            )}
          />
        )}
        <span className="min-w-0 truncate">{tag.name}</span>
        {!isDisabled && (
          <IconTooltip label={t("tags.remove_named", { name: tag.name })}>
            <button
              type="button"
              aria-label={t("tags.remove_named", {
                name: tag.name,
              })}
              className={removeClassName}
              onClick={(e) => {
                e.stopPropagation();
                onChange({
                  action: "remove-value",
                  id: tag.id,
                  name: tag.name,
                });
              }}
            >
              <X className="size-4" />
            </button>
          </IconTooltip>
        )}
      </div>
    </div>
  );

  const optionsList = (
    <CommandList className="max-h-64">
      {displayedOptions.length === 0 ? (
        <CommandEmpty>
          {trimmedInputValue && allowCreation ? (
            <div className="flex items-center justify-between px-2 py-1.5">
              <span>{t("tags.create_named", { name: trimmedInputValue })}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={createTag}
                className="h-auto p-1 has-[>svg]:px-1"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            t("tags.none_found")
          )}
        </CommandEmpty>
      ) : (
        <CommandGroup>
          {displayedOptions.map((option) => {
            const isSelected = selectedValues.includes(option.id);
            return (
              <CommandItem
                key={
                  option.isCreateOption ? `create-${option.name}` : option.id
                }
                value={option.label}
                className={cn(
                  variant === "inline" &&
                    "cursor-pointer max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11",
                )}
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
                  <span>{option.label}</span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}
    </CommandList>
  );

  if (variant === "inline") {
    const addLabel = t("preview.tags_add");
    const addWidth = Math.max(inputValue.length, addLabel.length, 1);
    return (
      <div ref={containerRef} className="w-full">
        <Popover open={open && !isDisabled} onOpenChange={setOpen}>
          <Command
            label={t("common.tags")}
            shouldFilter={false}
            className="overflow-visible bg-transparent"
          >
            <PopoverAnchor asChild>
              <div className="flex flex-wrap items-center gap-1.5 max-sm:gap-y-3 [@media(pointer:coarse)]:gap-y-3">
                {optimisticTags.map((tag) =>
                  renderChip(
                    tag,
                    cn(
                      "inline-flex h-8 min-w-0 max-w-full items-center rounded bg-accent pl-2 text-sm text-foreground",
                      isDisabled && "pr-2",
                    ),
                    // Stays the chip's size, and reaches 44px for touch past its edges.
                    "relative flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:after:absolute max-sm:after:-inset-1.5 [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-1.5",
                  ),
                )}
                {!isDisabled && (
                  <label className="relative inline-flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-sm text-muted-foreground transition-colors focus-within:bg-accent focus-within:text-foreground focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent hover:text-foreground max-sm:after:absolute max-sm:after:-inset-y-1.5 max-sm:after:inset-x-0 [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-1.5 [@media(pointer:coarse)]:after:inset-x-0">
                    <Plus className="size-4 shrink-0" />
                    <CommandPrimitive.Input
                      ref={inputRef}
                      value={inputValue}
                      aria-label={addLabel}
                      placeholder={addLabel}
                      className="cursor-pointer bg-transparent text-inherit outline-none placeholder:text-current focus:cursor-text focus:placeholder:text-muted-foreground"
                      style={{ width: `${addWidth}ch` }}
                      onKeyDown={handleKeyDown}
                      onValueChange={(v) => {
                        setInputValue(v);
                        setOpen(true);
                      }}
                      onFocus={() => setOpen(true)}
                      onClick={() => setOpen(true)}
                    />
                  </label>
                )}
              </div>
            </PopoverAnchor>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] min-w-56 p-0"
              align="start"
              collisionPadding={8}
              onWheel={(e) => e.stopPropagation()}
              // Typing continues in the input, which sits outside this popover.
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                if (
                  e.target instanceof Node &&
                  containerRef.current?.contains(e.target)
                ) {
                  e.preventDefault();
                }
              }}
            >
              {optionsList}
            </PopoverContent>
          </Command>
        </Popover>
      </div>
    );
  }

  const inputPlaceholder =
    placeholder ??
    (allowCreation
      ? t("tags.search_or_create_placeholder", {
          defaultValue: "Search or create tags...",
        })
      : t("tags.search_placeholder", {
          defaultValue: "Search tags...",
        }));
  let visiblePlaceholder: string | undefined = inputPlaceholder;
  if (optimisticTags.length > 0) {
    visiblePlaceholder = isDisabled ? undefined : t("tags.add_tag");
  }
  const inputWidth = Math.max(
    inputValue.length > 0
      ? inputValue.length
      : Math.min(visiblePlaceholder?.length ?? 1, 24),
    1,
  );

  return (
    <div ref={containerRef} className="w-full">
      <Popover open={open && !isDisabled} onOpenChange={handleOpenChange}>
        <Command label={t("common.tags")} shouldFilter={false}>
          <PopoverTrigger asChild>
            <div
              className={cn(
                "relative flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-accent/60",
                isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              {optimisticTags.map((tag) =>
                renderChip(
                  tag,
                  cn(
                    "flex min-h-8 rounded pl-2 pr-1 max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11",
                    tag.attachedBy == "ai"
                      ? "bg-purple-500 text-white"
                      : "bg-accent",
                  ),
                  "flex size-6 shrink-0 items-center justify-center rounded opacity-70 outline-none hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-11 [@media(pointer:coarse)]:size-11",
                ),
              )}
              <CommandPrimitive.Input
                ref={inputRef}
                value={inputValue}
                onKeyDown={handleKeyDown}
                onValueChange={(v) => {
                  setInputValue(v);
                  // Tabbing to the field and typing doesn't go through the trigger
                  if (!open) {
                    handleOpenChange(true);
                  }
                }}
                placeholder={visiblePlaceholder}
                className="bg-transparent outline-none placeholder:text-muted-foreground"
                style={{ width: `${inputWidth}ch` }}
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
            onWheel={(e) => e.stopPropagation()}
          >
            {optionsList}
          </PopoverContent>
        </Command>
      </Popover>
    </div>
  );
}
