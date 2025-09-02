import { View } from "react-native";
import { Text } from "@/components/ui/Text";

export default function ErrorPage() {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text variant="largeTitle">Error!</Text>
    </View>
  );
}
