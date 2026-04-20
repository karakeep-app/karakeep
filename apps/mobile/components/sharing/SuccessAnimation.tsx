import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";

interface ParticleProps {
  angle: number;
  delay: number;
  color: string;
}

function Particle({ angle, delay, color }: ParticleProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      200 + delay,
      withSequence(
        withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 300 }),
      ),
    );
  }, []);

  const particleStyle = useAnimatedStyle(() => {
    const distance = interpolate(progress.value, [0, 1], [0, 60]);
    const opacity = interpolate(progress.value, [0, 0.5, 1], [0, 1, 0]);
    const scale = interpolate(progress.value, [0, 0.5, 1], [0, 1, 0]);
    const angleRad = (angle * Math.PI) / 180;

    return {
      position: "absolute" as const,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: color,
      opacity,
      transform: [
        { translateX: Math.cos(angleRad) * distance },
        { translateY: Math.sin(angleRad) * distance },
        { scale },
      ],
    };
  });

  return <Animated.View style={particleStyle} />;
}

interface SuccessAnimationProps {
  isAlreadyExists: boolean;
}

export default function SuccessAnimation({
  isAlreadyExists,
}: SuccessAnimationProps) {
  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);

  const particleColor = isAlreadyExists
    ? "rgb(255, 180, 0)"
    : "rgb(0, 200, 100)";

  useEffect(() => {
    Haptics.notificationAsync(
      isAlreadyExists
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success,
    );

    ringScale.value = withSequence(
      withTiming(1.2, { duration: 400, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 200 }),
    );
    ringOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withDelay(300, withTiming(0.3, { duration: 300 })),
    );

    checkScale.value = withDelay(
      150,
      withSpring(1, {
        damping: 12,
        stiffness: 200,
        mass: 0.8,
      }),
    );
    checkOpacity.value = withDelay(150, withTiming(1, { duration: 200 }));
  }, [isAlreadyExists]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkOpacity.value,
  }));

  return (
    <View className="items-center justify-center">
      {Array.from({ length: 8 }, (_, i) => (
        <Particle
          key={i}
          angle={(i * 360) / 8}
          delay={i * 50}
          color={particleColor}
        />
      ))}

      <Animated.View
        style={ringStyle}
        className={`absolute h-28 w-28 rounded-full ${
          isAlreadyExists ? "bg-yellow-500/20" : "bg-green-500/20"
        }`}
      />

      <Animated.View
        style={checkStyle}
        className={`h-24 w-24 items-center justify-center rounded-full ${
          isAlreadyExists ? "bg-yellow-500" : "bg-green-500"
        }`}
      >
        <Check size={48} color="white" strokeWidth={3} />
      </Animated.View>
    </View>
  );
}
