import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";

export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  const { colors } = useColorScheme();

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      className="items-center justify-center py-12"
    >
      <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Icon size={36} color={colors.primary} />
      </View>
      <Text variant="title3">{title}</Text>
      <Text className="mt-1 text-center text-muted-foreground">{subtitle}</Text>
    </Animated.View>
  );
}
