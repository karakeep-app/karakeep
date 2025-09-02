import { View } from "react-native";
import { Text } from "@/components/ui/Text";

import { Button } from "./ui/Button";

export default function FullPageError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <View className="size-full items-center justify-center">
      <View className="h-1/4 items-center justify-between rounded-lg border border-gray-500 border-transparent bg-background px-10 py-4">
        <Text className="text-bold text-3xl text-foreground">
          Something Went Wrong
        </Text>
        <Text className="text-foreground"> {error}</Text>
        <Button onPress={onRetry}>
          <Text>Retry</Text>
        </Button>
      </View>
    </View>
  );
}
