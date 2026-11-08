import { AppIcon } from "@/components/ui/AppIcon";
import type { BookmarkActionController } from "@/components/bookmarks/card/use-bookmark-actions";
import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { MenuView } from "@react-native-menu/menu";
import * as Haptics from "expo-haptics";
import { Ellipsis, ShareIcon, Star } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";

const FAVOURITE_COLOR = "#ebb434";
const HIT_SLOP = 10;

export default function ActionBar({
  actions,
  compact = false,
  itemName,
}: {
  actions: BookmarkActionController;
  compact?: boolean;
  /** Tells VoiceOver which bookmark each repeated control belongs to. */
  itemName?: string;
}) {
  const { t } = useTranslation();
  const named = (label: string) =>
    itemName
      ? t("bookmark_actions.named_label", { label, name: itemName })
      : label;
  const { colors } = useColorScheme();
  const size = compact ? 18 : 20;

  return (
    <View className={compact ? "flex-row gap-4" : "flex-row gap-5"}>
      {actions.isBusy && <ActivityIndicator size="small" />}
      {actions.isOwner && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            actions.isFavourited
              ? t("bookmark_actions.remove_from_favourites_label")
              : t("bookmark_actions.add_to_favourites_label")
          }
          hitSlop={HIT_SLOP}
          onPress={() => {
            void Haptics.selectionAsync();
            actions.toggleFavourite();
          }}
        >
          {actions.isFavourited ? (
            <AppIcon icon={Star} filled color={FAVOURITE_COLOR} size={size} />
          ) : (
            <AppIcon icon={Star} color={colors.icon} size={size} />
          )}
        </Pressable>
      )}

      {/* The compact row reaches Share through the menu to stay scannable. */}
      {!compact && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={named(t("bookmark_actions.share"))}
          hitSlop={HIT_SLOP}
          onPress={() => {
            void Haptics.selectionAsync();
            actions.share();
          }}
        >
          <AppIcon icon={ShareIcon} color={colors.icon} size={size} />
        </Pressable>
      )}

      {actions.menuActions.length > 0 && (
        <MenuView
          onPressAction={({ nativeEvent }) => {
            void Haptics.selectionAsync();
            actions.handleAction(nativeEvent.event);
          }}
          actions={actions.contextMenuActions}
          shouldOpenOnLongPress={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={named(t("bookmark_actions.more_actions_label"))}
            hitSlop={HIT_SLOP}
            onPress={() => void Haptics.selectionAsync()}
          >
            <AppIcon icon={Ellipsis} color={colors.icon} size={size} />
          </Pressable>
        </MenuView>
      )}
    </View>
  );
}
