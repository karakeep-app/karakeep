import { useCallback, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { History, ListTree, Sparkles, Tag as TagIcon } from "lucide-react";
import type { TFunction } from "i18next";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTagAutocomplete } from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";

const MAX_DISPLAY_SUGGESTIONS = 5;

const QUALIFIER_DEFINITIONS = [
  {
    value: "is:fav",
    descriptionKey: "search.is_favorited",
    negatedDescriptionKey: "search.is_not_favorited",
    appendSpace: true,
  },
  {
    value: "is:archived",
    descriptionKey: "search.is_archived",
    negatedDescriptionKey: "search.is_not_archived",
    appendSpace: true,
  },
  {
    value: "is:tagged",
    descriptionKey: "search.has_any_tag",
    negatedDescriptionKey: "search.has_no_tags",
    appendSpace: true,
  },
  {
    value: "is:inlist",
    descriptionKey: "search.is_in_any_list",
    negatedDescriptionKey: "search.is_not_in_any_list",
    appendSpace: true,
  },
  {
    value: "is:link",
    descriptionKey: undefined,
    appendSpace: true,
  },
  {
    value: "is:text",
    descriptionKey: undefined,
    appendSpace: true,
  },
  {
    value: "is:media",
    descriptionKey: undefined,
    appendSpace: true,
  },
  {
    value: "url:",
    descriptionKey: "search.url_contains",
  },
  {
    value: "title:",
    descriptionKey: "search.title_contains",
  },
  {
    value: "list:",
    descriptionKey: "search.is_in_list",
  },
  {
    value: "after:",
    descriptionKey: "search.created_on_or_after",
  },
  {
    value: "before:",
    descriptionKey: "search.created_on_or_before",
  },
  {
    value: "feed:",
    descriptionKey: "search.is_from_feed",
  },
  {
    value: "age:",
    descriptionKey: "search.created_within",
  },
  {
    value: "and",
    descriptionKey: "search.and",
    appendSpace: true,
  },
  {
    value: "or",
    descriptionKey: "search.or",
    appendSpace: true,
  },
] satisfies ReadonlyArray<{
  value: string;
  descriptionKey?: string;
  negatedDescriptionKey?: string;
  appendSpace?: boolean;
}>;

export interface AutocompleteSuggestionItem {
  type: "token" | "tag" | "list";
  id: string;
  label: string;
  insertText: string;
  appendSpace?: boolean;
  description?: string;
  Icon: LucideIcon;
}

export interface HistorySuggestionItem {
  type: "history";
  id: string;
  term: string;
  label: string;
  Icon: LucideIcon;
}

export type SuggestionItem =
  | AutocompleteSuggestionItem
  | HistorySuggestionItem;

export interface SuggestionGroup {
  id: string;
  label: string;
  items: SuggestionItem[];
}

const stripSurroundingQuotes = (value: string) => {
  let nextValue = value;
  if (nextValue.startsWith('"')) {
    nextValue = nextValue.slice(1);
  }
  if (nextValue.endsWith('"')) {
    nextValue = nextValue.slice(0, -1);
  }
  return nextValue;
};

const shouldQuoteValue = (value: string) => /[\s:]/.test(value);

const formatSearchValue = (value: string) =>
  shouldQuoteValue(value) ? `"${value}"` : value;

interface UseSearchAutocompleteParams {
  value: string;
  onValueChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isPopoverOpen: boolean;
  setIsPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  t: TFunction;
  history: string[];
}

export const useSearchAutocomplete = ({
  value,
  onValueChange,
  inputRef,
  isPopoverOpen,
  setIsPopoverOpen,
  t,
  history,
}: UseSearchAutocompleteParams) => {
  const getActiveToken = useCallback(
    (cursorPosition: number) => {
      let start = 0;
      let inQuotes = false;

      for (let index = 0; index < cursorPosition; index += 1) {
        const char = value[index];
        if (char === '"') {
          inQuotes = !inQuotes;
          continue;
        }

        if (!inQuotes) {
          if (char === " " || char === "\t" || char === "\n") {
            start = index + 1;
            continue;
          }

          if (char === "(") {
            start = index + 1;
          }
        }
      }

      return {
        token: value.slice(start, cursorPosition),
        start,
      };
    },
    [value],
  );

  const activeTokenInfo = useMemo(
    () => getActiveToken(value.length),
    [getActiveToken, value],
  );
  const activeToken = activeTokenInfo.token;
  const isTokenNegative = activeToken.startsWith("-");
  const tokenWithoutMinus = isTokenNegative
    ? activeToken.slice(1)
    : activeToken;
  const normalizedTokenWithoutMinus = tokenWithoutMinus.toLowerCase();

  const shouldSuggestTags = tokenWithoutMinus.startsWith("#");
  const shouldSuggestLists = normalizedTokenWithoutMinus.startsWith("list:");

  const tagSearchTermRaw = shouldSuggestTags ? tokenWithoutMinus.slice(1) : "";
  const tagSearchTerm = stripSurroundingQuotes(tagSearchTermRaw);
  const debouncedTagSearchTerm = useDebounce(tagSearchTerm, 200);
  const { data: tagResults } = useTagAutocomplete({
    nameContains: debouncedTagSearchTerm,
    select: (data) => data.tags,
  });

  const listSearchTermRaw = shouldSuggestLists
    ? tokenWithoutMinus.slice("list:".length)
    : "";
  const listSearchTerm = stripSurroundingQuotes(listSearchTermRaw);
  const normalizedListSearchTerm = listSearchTerm.toLowerCase();
  const { data: listResults } = useBookmarkLists();

  const qualifierSuggestions = useMemo<AutocompleteSuggestionItem[]>(() => {
    if (shouldSuggestTags || shouldSuggestLists) {
      return [];
    }

    return QUALIFIER_DEFINITIONS.filter((definition) => {
      if (normalizedTokenWithoutMinus.length === 0) {
        return true;
      }
      return definition.value
        .toLowerCase()
        .startsWith(normalizedTokenWithoutMinus);
    })
      .slice(0, MAX_DISPLAY_SUGGESTIONS)
      .map((definition) => {
        const insertText = `${isTokenNegative ? "-" : ""}${definition.value}`;
        const descriptionKey = isTokenNegative
          ? definition.negatedDescriptionKey ?? definition.descriptionKey
          : definition.descriptionKey;
        const description = descriptionKey
          ? String(t(descriptionKey as never))
          : undefined;

        return {
          type: "token" as const,
          id: `qualifier-${definition.value}`,
          label: insertText,
          insertText,
          appendSpace: definition.appendSpace,
          description,
          Icon: Sparkles,
        } satisfies AutocompleteSuggestionItem;
      });
  }, [
    shouldSuggestTags,
    shouldSuggestLists,
    normalizedTokenWithoutMinus,
    isTokenNegative,
    t,
  ]);

  const tagSuggestions = useMemo<AutocompleteSuggestionItem[]>(() => {
    if (!shouldSuggestTags) {
      return [];
    }

    return (tagResults ?? []).slice(0, MAX_DISPLAY_SUGGESTIONS).map((tag) => {
      const formattedName = formatSearchValue(tag.name);
      const insertText = `${isTokenNegative ? "-" : ""}#${formattedName}`;
      const description = `#${tag.name}`;

      return {
        type: "tag" as const,
        id: `tag-${tag.id}`,
        label: insertText,
        insertText,
        appendSpace: true,
        description: description !== insertText ? description : undefined,
        Icon: TagIcon,
      } satisfies AutocompleteSuggestionItem;
    });
  }, [shouldSuggestTags, tagResults, isTokenNegative]);

  const listSuggestions = useMemo<AutocompleteSuggestionItem[]>(() => {
    if (!shouldSuggestLists) {
      return [];
    }

    const lists = listResults?.data ?? [];

    return lists
      .filter((list) => {
        if (normalizedListSearchTerm.length === 0) {
          return true;
        }
        return list.name.toLowerCase().includes(normalizedListSearchTerm);
      })
      .slice(0, MAX_DISPLAY_SUGGESTIONS)
      .map((list) => {
        const formattedName = formatSearchValue(list.name);
        const insertText = `${isTokenNegative ? "-" : ""}list:${formattedName}`;
        return {
          type: "list" as const,
          id: `list-${list.id}`,
          label: insertText,
          insertText,
          appendSpace: true,
          description: list.name,
          Icon: ListTree,
        } satisfies AutocompleteSuggestionItem;
      });
  }, [
    shouldSuggestLists,
    listResults,
    normalizedListSearchTerm,
    isTokenNegative,
  ]);

  const historyItems = useMemo<HistorySuggestionItem[]>(() => {
    const trimmedValue = value.trim();
    const results =
      trimmedValue.length === 0
        ? history
        : history.filter((item) =>
            item.toLowerCase().includes(trimmedValue.toLowerCase()),
          );

    return results.slice(0, MAX_DISPLAY_SUGGESTIONS).map((term) => ({
      type: "history" as const,
      id: `history-${term}`,
      term,
      label: term,
      Icon: History,
    } satisfies HistorySuggestionItem));
  }, [history, value]);

  const suggestionGroups = useMemo<SuggestionGroup[]>(() => {
    const groups: SuggestionGroup[] = [];

    if (qualifierSuggestions.length > 0) {
      groups.push({
        id: "qualifiers",
        label: t("search.filters"),
        items: qualifierSuggestions,
      });
    }

    if (tagSuggestions.length > 0) {
      groups.push({
        id: "tags",
        label: t("search.tags"),
        items: tagSuggestions,
      });
    }

    if (listSuggestions.length > 0) {
      groups.push({
        id: "lists",
        label: t("search.lists"),
        items: listSuggestions,
      });
    }

    if (historyItems.length > 0) {
      groups.push({
        id: "history",
        label: t("search.history"),
        items: historyItems,
      });
    }

    return groups;
  }, [qualifierSuggestions, tagSuggestions, listSuggestions, historyItems, t]);

  const hasSuggestions = suggestionGroups.length > 0;
  const showEmptyState = isPopoverOpen && !hasSuggestions && activeToken.length > 0;
  const isPopoverVisible =
    isPopoverOpen && (hasSuggestions || showEmptyState);

  const handleSuggestionSelect = useCallback(
    (item: AutocompleteSuggestionItem) => {
      const input = inputRef.current;
      const selectionStart = input?.selectionStart ?? value.length;
      const selectionEnd = input?.selectionEnd ?? selectionStart;
      const { start } = getActiveToken(selectionStart);
      const beforeToken = value.slice(0, start);
      const afterToken = value.slice(selectionEnd);

      const needsSpace =
        item.appendSpace &&
        (afterToken.length === 0 || !/^\s/.test(afterToken));
      const baseValue = `${beforeToken}${item.insertText}${afterToken}`;
      const finalValue = needsSpace
        ? `${beforeToken}${item.insertText} ${afterToken}`
        : baseValue;

      onValueChange(finalValue);

      requestAnimationFrame(() => {
        const target = inputRef.current;
        if (!target) {
          return;
        }
        const cursorPosition =
          beforeToken.length + item.insertText.length + (needsSpace ? 1 : 0);
        target.focus();
        target.setSelectionRange(cursorPosition, cursorPosition);
      });

      setIsPopoverOpen(true);
    },
    [getActiveToken, onValueChange, value, inputRef, setIsPopoverOpen],
  );

  const handleCommandKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
    },
    [setIsPopoverOpen, inputRef],
  );

  return {
    suggestionGroups,
    hasSuggestions,
    showEmptyState,
    isPopoverVisible,
    handleSuggestionSelect,
    handleCommandKeyDown,
  };
};
