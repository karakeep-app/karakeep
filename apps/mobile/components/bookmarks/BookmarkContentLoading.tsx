import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Globe } from "lucide-react-native";

export default function BookmarkContentLoading() {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -12,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [bounceAnim]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background">
      <Animated.View style={{ transform: [{ translateY: bounceAnim }] }}>
        <Globe size={48} className="text-muted-foreground" />
      </Animated.View>
      <Text className="text-sm text-muted-foreground">
        Fetching page content…
      </Text>
    </View>
  );
}
