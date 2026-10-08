import type { Emoji, EmojiMartData } from "@emoji-mart/data";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import emojiData from "@emoji-mart/data";
import type { FlashListRef } from "@shopify/flash-list";
import { FlashList } from "@shopify/flash-list";
import { ChevronDown, Search, X } from "lucide-react-native";

import { useColorScheme } from "@/lib/useColorScheme";

import { Input } from "./Input";
import { Text } from "./Text";

const data = emojiData as EmojiMartData;

const CATEGORY_DETAILS: Record<string, { label: string; icon: string }> = {
  people: { label: "Smileys & people", icon: "😀" },
  nature: { label: "Animals & nature", icon: "🐻" },
  foods: { label: "Food & drink", icon: "🍎" },
  activity: { label: "Activities", icon: "⚽️" },
  places: { label: "Travel & places", icon: "🚗" },
  objects: { label: "Objects", icon: "💡" },
  symbols: { label: "Symbols", icon: "❤️" },
  flags: { label: "Flags", icon: "🏳️" },
};

const COLUMN_COUNT = 8;

interface EmojiChoice extends Emoji {
  categoryId: string;
  searchText: string;
}

const emojiCategories = data.categories.filter(
  (category) => CATEGORY_DETAILS[category.id],
);

const emojisByCategory = Object.fromEntries(
  emojiCategories.map((category) => [
    category.id,
    category.emojis
      .map((id) => {
        const emoji = data.emojis[id];
        if (!emoji) return undefined;
        return {
          ...emoji,
          categoryId: category.id,
          searchText: [emoji.id, emoji.name, ...emoji.keywords]
            .join(" ")
            .toLocaleLowerCase(),
        } satisfies EmojiChoice;
      })
      .filter((emoji): emoji is EmojiChoice => emoji !== undefined),
  ]),
) as Record<string, EmojiChoice[]>;

const allEmojis = emojiCategories.flatMap(
  (category) => emojisByCategory[category.id],
);

interface EmojiCellProps {
  emoji: EmojiChoice;
  selectedEmoji: string;
  size: number;
  onSelect: (emoji: string) => void;
}

const EmojiCell = memo(function EmojiCell({
  emoji,
  selectedEmoji,
  size,
  onSelect,
}: EmojiCellProps) {
  const glyph = emoji.skins[0].native;
  const selected = emoji.skins.some((skin) => skin.native === selectedEmoji);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choose ${emoji.name}`}
      accessibilityState={{ selected }}
      className={
        selected
          ? "items-center justify-center rounded-xl bg-primary/15"
          : "items-center justify-center rounded-xl active:bg-primary/10"
      }
      style={{ width: size, height: size, borderCurve: "continuous" }}
      onPress={() => onSelect(glyph)}
    >
      <Text className="text-[27px] leading-9">{glyph}</Text>
    </Pressable>
  );
});

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [visible, setVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState("people");
  const [searchQuery, setSearchQuery] = useState("");
  const emojiListRef = useRef<FlashListRef<EmojiChoice>>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();

  const sheetWidth = Math.min(width, 520);
  const emojiSize = Math.floor((sheetWidth - 24) / COLUMN_COUNT);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleEmojis = useMemo(() => {
    if (!normalizedQuery) {
      return emojisByCategory[activeCategory] ?? [];
    }

    const terms = normalizedQuery.split(/\s+/);
    return allEmojis.filter((emoji) =>
      terms.every((term) => emoji.searchText.includes(term)),
    );
  }, [activeCategory, normalizedQuery]);

  useEffect(() => {
    emojiListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeCategory, normalizedQuery]);

  const closePicker = useCallback(() => {
    setVisible(false);
    setSearchQuery("");
  }, []);

  const selectEmoji = useCallback(
    (emoji: string) => {
      if (process.env.EXPO_OS === "ios") {
        void Haptics.selectionAsync();
      }
      onChange(emoji);
      closePicker();
    },
    [closePicker, onChange],
  );

  const renderEmoji = useCallback(
    ({ item }: { item: EmojiChoice }) => (
      <EmojiCell
        emoji={item}
        selectedEmoji={value}
        size={emojiSize}
        onSelect={selectEmoji}
      />
    ),
    [emojiSize, selectEmoji, value],
  );

  const categoryLabel = normalizedQuery
    ? `${visibleEmojis.length} results`
    : CATEGORY_DETAILS[activeCategory].label;

  return (
    <>
      <View className="gap-1.5">
        <Text className="text-sm text-muted-foreground">Icon</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`List icon: ${value}. Open emoji picker`}
          className="h-14 flex-row items-center rounded-xl border border-input bg-card px-3 active:opacity-70"
          style={{ borderCurve: "continuous" }}
          onPress={() => setVisible(true)}
        >
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-background">
            <Text className="text-2xl leading-8">{value}</Text>
          </View>
          <View className="flex-1 px-3">
            <Text className="font-medium">List icon</Text>
            <Text className="text-xs text-muted-foreground">
              Search the full emoji library
            </Text>
          </View>
          <ChevronDown size={18} color={colors.grey} />
        </Pressable>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <KeyboardAvoidingView
          className="flex-1 items-center justify-end"
          behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            accessibilityLabel="Close emoji picker"
            className="absolute inset-0 bg-black/40"
            onPress={closePicker}
          />
          <View
            className="w-full overflow-hidden rounded-t-[28px] bg-card pt-3"
            style={{
              maxWidth: 520,
              height: Math.min(height * 0.82, 720),
              paddingBottom: Math.max(insets.bottom, 12),
              borderCurve: "continuous",
            }}
          >
            <View className="h-1 w-10 self-center rounded-full bg-muted" />
            <View className="flex-row items-center justify-between px-5 py-4">
              <Text className="text-xl font-semibold">Choose an icon</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="h-9 w-9 items-center justify-center rounded-full bg-background active:opacity-70"
                onPress={closePicker}
              >
                <X size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <View className="px-3 pb-2">
              <View className="justify-center">
                <View
                  pointerEvents="none"
                  className="absolute left-3 z-10 items-center justify-center"
                >
                  <Search size={18} color={colors.grey} />
                </View>
                <Input
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search emoji"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  inputClasses="h-11 rounded-xl bg-background pl-10 pr-10"
                />
                {searchQuery.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    className="absolute right-2 h-8 w-8 items-center justify-center rounded-full"
                    onPress={() => setSearchQuery("")}
                  >
                    <X size={16} color={colors.grey} />
                  </Pressable>
                )}
              </View>
            </View>

            <ScrollView
              horizontal
              className="h-12 flex-grow-0"
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-1 px-3 pb-2"
              keyboardShouldPersistTaps="handled"
            >
              {emojiCategories.map((category) => {
                const details = CATEGORY_DETAILS[category.id];
                const selected =
                  !normalizedQuery && activeCategory === category.id;
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="tab"
                    accessibilityLabel={details.label}
                    accessibilityState={{ selected }}
                    className={
                      selected
                        ? "h-10 w-10 items-center justify-center rounded-xl bg-primary/15"
                        : "h-10 w-10 items-center justify-center rounded-xl active:bg-primary/10"
                    }
                    style={{ borderCurve: "continuous" }}
                    onPress={() => {
                      setSearchQuery("");
                      setActiveCategory(category.id);
                    }}
                  >
                    <Text className="text-xl leading-7">{details.icon}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View className="px-4 py-1">
              <Text className="text-sm font-medium text-muted-foreground">
                {categoryLabel}
              </Text>
            </View>

            <FlashList
              ref={emojiListRef}
              data={visibleEmojis}
              numColumns={COLUMN_COUNT}
              renderItem={renderEmoji}
              keyExtractor={(item) => item.id}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              maintainVisibleContentPosition={{ disabled: true }}
              contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4 }}
              ListEmptyComponent={
                <View className="items-center gap-1 py-16">
                  <Text className="text-lg font-medium">No emoji found</Text>
                  <Text className="text-sm text-muted-foreground">
                    Try a different search
                  </Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
