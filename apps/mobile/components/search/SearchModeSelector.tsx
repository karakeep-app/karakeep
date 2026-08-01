import { Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import { useClientConfig } from "@/lib/client-config";
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
    label: "Keyword",
    description: "Match exact words across your bookmarks.",
    image: "text.magnifyingglass",
    Icon: TextSearch,
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Balance exact matches and related ideas.",
    image: "arrow.up.arrow.down",
    Icon: Blend,
  },
  {
    value: "semantic",
    label: "Semantic",
    description: "Find related ideas when the words differ.",
    image: "brain",
    Icon: BrainCircuit,
  },
] as const;

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
  const { menuIconColor } = useMenuIconColors();

  if (!semanticSearchEnabled) {
    return null;
  }

  const activeMode =
    SEARCH_MODES.find((mode) => mode.value === value) ?? SEARCH_MODES[0];
  const ActiveIcon = activeMode.Icon;

  const actions = SEARCH_MODES.map((mode) => ({
    id: mode.value,
    title:
      Platform.OS === "android" && mode.value === value
        ? `✓ ${mode.label}`
        : mode.label,
    subtitle: mode.description,
    state: mode.value === value ? ("on" as const) : ("off" as const),
    image: Platform.select({ ios: mode.image }),
    imageColor: Platform.select({ ios: menuIconColor }),
  }));

  return (
    <View className={cn("flex-row justify-end py-1", className)}>
      <MenuView
        title="Search mode"
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
          accessibilityLabel={`Search mode: ${activeMode.label}`}
          accessibilityHint="Opens the search mode menu"
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
            {activeMode.label}
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
