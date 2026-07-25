import type { LucideIcon } from "lucide-react-native";
import { Platform, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";
import { CircleAlert } from "lucide-react-native";

import { Button } from "./ui/Button";

export default function FullPageError({
  error,
  onRetry,
  title = "Couldn't load this page",
  icon: Icon = CircleAlert,
  detail,
}: {
  error: string;
  onRetry: () => void;
  title?: string;
  icon?: LucideIcon;
  detail?: string;
}) {
  const { colors } = useColorScheme();

  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View className="w-full max-w-sm items-center">
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Icon size={28} color={colors.grey} />
        </View>
        <Text variant="title2" className="text-center">
          {title}
        </Text>
        <Text className="mt-2 text-center leading-5 text-muted-foreground">
          {error}
        </Text>
        {detail ? (
          <Text
            className="mt-2 text-center text-xs text-muted-foreground"
            numberOfLines={3}
          >
            {detail}
          </Text>
        ) : null}
        <Button
          className="mt-6"
          variant={Platform.OS === "android" ? "plain" : "tonal"}
          size={Platform.OS === "android" ? "sm" : "md"}
          onPress={onRetry}
        >
          <Text>Try again</Text>
        </Button>
      </View>
    </View>
  );
}
