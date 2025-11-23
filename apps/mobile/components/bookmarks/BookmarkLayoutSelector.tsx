import { Pressable, View } from "react-native";
import useAppSettings from "@/lib/settings";
import { LayoutGrid, List } from "lucide-react-native";
import * as Haptics from "expo-haptics";

export default function BookmarkLayoutSelector() {
  const { settings, setSettings } = useAppSettings();
  const currentLayout = settings.bookmarkGridLayout;

  const toggleLayout = async () => {
    await Haptics.selectionAsync();
    await setSettings({
      ...settings,
      bookmarkGridLayout: currentLayout === "card" ? "list" : "card",
    });
  };

  return (
    <Pressable onPress={toggleLayout}>
      <View className="mr-4">
        {currentLayout === "card" ? (
          <List size={24} color="rgb(0, 122, 255)" />
        ) : (
          <LayoutGrid size={24} color="rgb(0, 122, 255)" />
        )}
      </View>
    </Pressable>
  );
}
