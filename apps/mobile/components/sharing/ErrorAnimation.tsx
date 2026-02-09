import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { AlertCircle } from "lucide-react-native";

export default function ErrorAnimation() {
  const scale = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 50 }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shake.value }],
  }));

  return (
    <Animated.View style={style} className="items-center gap-4">
      <View className="h-24 w-24 items-center justify-center rounded-full bg-destructive">
        <AlertCircle size={48} color="white" strokeWidth={2} />
      </View>
    </Animated.View>
  );
}
