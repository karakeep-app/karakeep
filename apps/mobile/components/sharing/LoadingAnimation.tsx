import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { Archive } from "lucide-react-native";

export default function LoadingAnimation() {
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(0.6);
  const dotOpacity1 = useSharedValue(0);
  const dotOpacity2 = useSharedValue(0);
  const dotOpacity3 = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    rotation.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.6, { duration: 800 }),
      ),
      -1,
      false,
    );

    dotOpacity1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 300 }),
        withDelay(900, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
    dotOpacity2.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300 }),
          withDelay(600, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    );
    dotOpacity3.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300 }),
          withDelay(300, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    );
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
    opacity: opacity.value,
  }));

  const dot1Style = useAnimatedStyle(() => ({ opacity: dotOpacity1.value }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: dotOpacity2.value }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: dotOpacity3.value }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="items-center gap-6"
    >
      <Animated.View
        style={iconStyle}
        className="h-24 w-24 items-center justify-center rounded-full bg-primary/10"
      >
        <Archive size={48} className="text-primary" strokeWidth={1.5} />
      </Animated.View>
      <View className="flex-row items-baseline">
        <Text variant="title1" className="font-semibold text-foreground">
          Hoarding
        </Text>
        <View className="w-8 flex-row">
          <Animated.Text style={dot1Style} className="text-xl text-foreground">
            .
          </Animated.Text>
          <Animated.Text style={dot2Style} className="text-xl text-foreground">
            .
          </Animated.Text>
          <Animated.Text style={dot3Style} className="text-xl text-foreground">
            .
          </Animated.Text>
        </View>
      </View>
    </Animated.View>
  );
}
