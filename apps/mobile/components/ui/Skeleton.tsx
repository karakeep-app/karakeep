import type { View } from "react-native";
import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<typeof View>) {
  const fadeAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fadeAnim]);

  return (
    <Animated.View
      className={cn("rounded-md bg-muted", className)}
      style={[{ opacity: fadeAnim }]}
      {...props}
    />
  );
}

export { Skeleton };
