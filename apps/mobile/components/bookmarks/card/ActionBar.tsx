import type { BookmarkActionController } from "@/components/bookmarks/card/use-bookmark-actions";
import { MenuView } from "@react-native-menu/menu";
import * as Haptics from "expo-haptics";
import { Ellipsis, ShareIcon, Star } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";

export default function ActionBar({
  actions,
  compact = false,
}: {
  actions: BookmarkActionController;
  compact?: boolean;
}) {
  return (
    <View className={compact ? "flex flex-row gap-3" : "flex flex-row gap-4"}>
      {actions.isBusy && <ActivityIndicator />}
      {actions.isOwner && (
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            actions.toggleFavourite();
          }}
        >
          {actions.isFavourited ? (
            <Star fill="#ebb434" color="#ebb434" size={compact ? 20 : 24} />
          ) : (
            <Star color="gray" size={compact ? 20 : 24} />
          )}
        </Pressable>
      )}

      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          actions.share();
        }}
      >
        <ShareIcon color="gray" size={compact ? 20 : 24} />
      </Pressable>

      {actions.menuActions.length > 0 && (
        <MenuView
          onPressAction={({ nativeEvent }) => {
            void Haptics.selectionAsync();
            actions.handleAction(nativeEvent.event);
          }}
          actions={actions.menuActions}
          shouldOpenOnLongPress={false}
        >
          <Ellipsis
            onPress={() => void Haptics.selectionAsync()}
            color="gray"
            size={compact ? 20 : 24}
          />
        </MenuView>
      )}
    </View>
  );
}
