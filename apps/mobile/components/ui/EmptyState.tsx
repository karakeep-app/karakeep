import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppIcon } from "@/components/ui/AppIcon";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";

export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
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
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <AppIcon icon={Icon} size={27} color={colors.primary} />
      </View>
      <Text
        variant="heading"
        style={{ textAlign: "center", width: "100%", maxWidth: 320 }}
      >
        {title}
      </Text>
      <Text
        variant="subhead"
        color="tertiary"
        style={{
          textAlign: "center",
          width: "100%",
          maxWidth: 320,
          marginTop: 4,
        }}
      >
        {subtitle}
      </Text>
      {actionLabel && onAction && (
        <Button className="mt-5" variant="tonal" onPress={onAction}>
          <Text>{actionLabel}</Text>
        </Button>
      )}
    </Animated.View>
  );
}
