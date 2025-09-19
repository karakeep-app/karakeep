import { ActivityIndicator, View } from "react-native";

export default function FullPageSpinner() {
  return (
    <View className="h-full w-full items-center justify-center bg-gray-100 dark:bg-background">
      <ActivityIndicator />
    </View>
  );
}
