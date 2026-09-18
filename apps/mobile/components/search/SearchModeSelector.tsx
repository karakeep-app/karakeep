import { Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import { useClientConfig } from "@/lib/client-config";
import { useTranslation } from "@/lib/i18n/hooks";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { cn } from "@/lib/utils";
import { MenuView } from "@react-native-menu/menu";
import {
  Blend,
  BrainCircuit,
  ChevronDown,
  TextSearch,
} from "lucide-react-native";

import type { ZBookmarkSearchMode } from "@karakeep/shared/types/bookmarks";

const SEARCH_MODES = [
  {
    value: "fts",
    labelKey: "search.mode_keyword",
    descriptionKey: "search.mode_keyword_description",
    image: "text.magnifyingglass",
    Icon: TextSearch,
  },
  {
    value: "hybrid",
    labelKey: "search.mode_hybrid",
    descriptionKey: "search.mode_hybrid_description",
    image: "arrow.up.arrow.down",
    Icon: Blend,
  },
  {
    value: "semantic",
    labelKey: "search.mode_semantic",
    descriptionKey: "search.mode_semantic_description",
    image: "brain",
    Icon: BrainCircuit,
  },
] as const;

export type SearchModePlaceholderKey =
  | "search.placeholder_keyword"
  | "search.placeholder_hybrid"
  | "search.placeholder_semantic";

export const SEARCH_MODE_PLACEHOLDER_KEYS: Record<
  ZBookmarkSearchMode,
  SearchModePlaceholderKey
> = {
  fts: "search.placeholder_keyword",
  hybrid: "search.placeholder_hybrid",
  semantic: "search.placeholder_semantic",
};

/** @deprecated Use SEARCH_MODE_PLACEHOLDER_KEYS with t() instead. */
export const SEARCH_MODE_PLACEHOLDERS: Record<ZBookmarkSearchMode, string> = {
  fts: "Search bookmarks...",
  hybrid: "Search by words or meaning...",
  semantic: "Describe what you remember...",
};

export function SearchModeSelector({
  value,
  onValueChange,
  className,
}: {
  value: ZBookmarkSearchMode;
  onValueChange: (value: ZBookmarkSearchMode) => void;
  className?: string;
}) {
  const { semanticSearchEnabled } = useClientConfig().search;
  const { t } = useTranslation();
  const { menuIconColor } = useMenuIconColors();

  if (!semanticSearchEnabled) {
    return null;
  }

  const activeMode =
    SEARCH_MODES.find((mode) => mode.value === value) ?? SEARCH_MODES[0];
  const ActiveIcon = activeMode.Icon;
  const activeLabel = t(activeMode.labelKey);

  const actions = SEARCH_MODES.map((mode) => {
    const label = t(mode.labelKey);
    return {
      id: mode.value,
      title:
        Platform.OS === "android" && mode.value === value
          ? `✓ ${label}`
          : label,
      subtitle: t(mode.descriptionKey),
      state: mode.value === value ? ("on" as const) : ("off" as const),
      image: Platform.select({ ios: mode.image }),
      imageColor: Platform.select({ ios: menuIconColor }),
    };
  });

  return (
    <View className={cn("flex-row justify-end py-1", className)}>
      <MenuView
        title={t("search.mode_title")}
        actions={actions}
        shouldOpenOnLongPress={false}
        onPressAction={({ nativeEvent }) => {
          const mode = SEARCH_MODES.find(
            (option) => option.value === nativeEvent.event,
          );
          if (!mode || mode.value === value) {
            return;
          }
          if (Platform.OS === "ios") {
            void Haptics.selectionAsync();
          }
          onValueChange(mode.value);
        }}
      >
        <Pressable
          accessibilityLabel={t("search.mode_active_label", {
            mode: activeLabel,
          })}
          accessibilityHint={t("search.mode_hint")}
          accessibilityRole="button"
          className={cn(
            "min-h-11 flex-row items-center gap-1.5 rounded-full border px-3",
            value === "fts"
              ? "border-border bg-card"
              : "border-primary/20 bg-primary/10",
          )}
        >
          <TailwindResolver
            className={
              value === "fts" ? "text-muted-foreground" : "text-primary"
            }
            comp={(styles) => (
              <ActiveIcon size={16} color={styles?.color?.toString()} />
            )}
          />
          <Text
            variant="footnote"
            className={
              value === "fts"
                ? "font-medium text-muted-foreground"
                : "font-medium text-primary"
            }
          >
            {activeLabel}
          </Text>
          <TailwindResolver
            className={
              value === "fts" ? "text-muted-foreground" : "text-primary"
            }
            comp={(styles) => (
              <ChevronDown size={14} color={styles?.color?.toString()} />
            )}
          />
        </Pressable>
      </MenuView>
    </View>
  );
}
