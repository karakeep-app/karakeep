import { useRef } from "react";
import type { TextInput } from "react-native";
import { Pressable, View } from "react-native";
import { ListParentField } from "@/components/lists/list-parent-field";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { i18n } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";

import { useTagAutocomplete } from "@karakeep/shared-react/hooks/tags";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";

/**
 * Turns the server's search-parser wording into something a person can act on.
 */
export function getSmartQueryErrorMessage(message: string, query: string) {
  if (!message.toLowerCase().includes("unqualified")) {
    return message;
  }
  const leftover = parseSearchQuery(query).text.trim();
  return leftover
    ? i18n.t("lists.query_not_a_filter", { text: leftover })
    : i18n.t("lists.query_not_understood");
}

/** A trailing "#" or "url:" is a filter somebody hasn't finished typing yet. */
export function isSmartQueryIncomplete(query: string) {
  return /(^|\s)(#|url:)\s*$/.test(query);
}

export function ListFormFields({
  name,
  onNameChange,
  icon,
  onIconChange,
  parentId,
  onPressParent,
  isSmart,
  query,
  onQueryChange,
  queryError,
  autoFocus,
}: {
  name: string;
  onNameChange: (name: string) => void;
  icon: string;
  onIconChange: (icon: string) => void;
  parentId: string | null;
  onPressParent: () => void;
  isSmart: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  queryError?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const queryInputRef = useRef<TextInput>(null);
  // Plain-language starting points that write the query syntax for you.
  const queryShortcuts = [
    { label: t("lists.shortcut_tag"), insert: "#" },
    { label: t("lists.shortcut_favourites"), insert: "is:fav " },
    { label: t("lists.shortcut_site"), insert: "url:" },
    { label: t("lists.shortcut_last_week"), insert: "age:<7d " },
  ];
  const isTypingTag = /(^|\s)#$/.test(query);
  const { data: tagSuggestions } = useTagAutocomplete({
    nameContains: "",
    select: (data) => data.tags.slice(0, 8).map((tag) => tag.name),
    enabled: isSmart,
  });

  return (
    <>
      <GroupedSection>
        <View className="flex-row items-center">
          <EmojiPicker value={icon} onChange={onIconChange} />
          <Input
            className="flex-1"
            accessibilityLabel={t("lists.name_field")}
            onChangeText={onNameChange}
            value={name}
            placeholder={t("lists.name_field")}
            autoFocus={autoFocus}
            autoCapitalize="sentences"
            inputClasses="pl-0"
          />
        </View>
        <RowSeparator />
        <ListParentField value={parentId} onPress={onPressParent} />
      </GroupedSection>

      {isSmart && (
        <View className="gap-1.5">
          <GroupedSection header={t("lists.filter_header")}>
            <Input
              ref={queryInputRef}
              accessibilityLabel={t("lists.filter_label")}
              onChangeText={onQueryChange}
              value={query}
              placeholder={t("lists.filter_placeholder")}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </GroupedSection>
          {queryError ? (
            <Text variant="footnote" className="px-4 text-destructive">
              {queryError}
            </Text>
          ) : (
            <Text variant="footnote" color="tertiary" className="px-4">
              {t("lists.filter_hint")}
            </Text>
          )}
          <View className="flex-row flex-wrap gap-1.5 px-4 pt-1">
            {queryShortcuts.map((example) => (
              <Pressable
                key={example.insert}
                accessibilityRole="button"
                accessibilityLabel={t("lists.shortcut_add_label", {
                  name: example.label,
                })}
                className="rounded-full bg-card px-2.5 py-1 active:opacity-60"
                onPress={() => {
                  onQueryChange(
                    query.trim()
                      ? `${query.trim()} ${example.insert}`
                      : example.insert,
                  );
                  queryInputRef.current?.focus();
                }}
              >
                <Text variant="footnote" className="text-primary">
                  {example.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {isTypingTag && tagSuggestions && tagSuggestions.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 px-4 pt-1">
              {tagSuggestions.map((tag) => (
                <Pressable
                  key={tag}
                  accessibilityRole="button"
                  accessibilityLabel={t("lists.filter_by_tag_label", { tag })}
                  className="rounded-full bg-primary/10 px-2.5 py-1 active:opacity-60"
                  onPress={() =>
                    // Names with spaces or brackets only parse as one tag when quoted.
                    onQueryChange(
                      `${query}${/[\s()]/.test(tag) ? `"${tag}"` : tag} `,
                    )
                  }
                >
                  <Text variant="footnote" className="text-primary">
                    #{tag}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </>
  );
}
