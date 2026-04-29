import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import { useIsFocused } from "@react-navigation/core";
import { Search } from "lucide-react-native";

export default function AndroidSearchBar({
  label,
  onPress,
  rightElement,
}: {
  label: string;
  onPress: () => void;
  rightElement?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        marginBottom: 15,
        opacity: isFocused ? 1 : 0,
      }}
      className="bg-background px-4 pb-2 pt-2"
    >
      <Pressable
        className="flex flex-row items-center gap-4 rounded-full border-input bg-card px-4 py-2"
        style={{ minHeight: 56 }}
        onPress={onPress}
      >
        <TailwindResolver
          className="text-muted"
          comp={(styles) => (
            <Search size={24} color={styles?.color?.toString()} />
          )}
        />
        <Text className="flex-1 text-[17px] text-muted">{label}</Text>
        {rightElement}
      </Pressable>
    </View>
  );
}
