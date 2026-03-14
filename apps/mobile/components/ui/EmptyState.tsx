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
      style={{
        width: "100%",
        paddingHorizontal: 16,
        paddingVertical: 48,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Icon size={36} color={colors.primary} />
      </View>
      <Text variant="title3" style={{ textAlign: "center", width: "100%" }}>
        {title}
      </Text>
      <Text
        style={{ textAlign: "center", width: "100%", marginTop: 4 }}
        className="text-muted-foreground"
      >
        {subtitle}
      </Text>
    </Animated.View>
  );
}
