import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

interface ScrollIndicatorProps {
  /**
   * Current scroll position (Y offset)
   */
  scrollY: number;
  /**
   * Total height of the scrollable content
   */
  contentHeight: number;
  /**
   * Height of the visible container/viewport
   */
  containerHeight: number;
  /**
   * Whether to show the indicator
   */
  visible?: boolean;
}

/**
 * A visual scroll indicator that shows the user's position within scrollable content.
 * The indicator scales inversely with content length (smaller bar = longer content).
 *
 * @example
 * <ScrollIndicator
 *   scrollY={scrollPosition}
 *   contentHeight={totalHeight}
 *   containerHeight={viewportHeight}
 * />
 */
export default function ScrollIndicator({
  scrollY,
  contentHeight,
  containerHeight,
  visible = true,
}: ScrollIndicatorProps) {
  const animatedScrollY = useSharedValue(0);
  const animatedOpacity = useSharedValue(0);

  useEffect(() => {
    animatedScrollY.value = withSpring(scrollY, {
      damping: 15,
      stiffness: 150,
    });
  }, [scrollY, animatedScrollY]);

  useEffect(() => {
    // Show indicator only when there's content to scroll
    const hasScrollableContent = contentHeight > containerHeight;
    animatedOpacity.value = withSpring(visible && hasScrollableContent ? 1 : 0, {
      damping: 20,
      stiffness: 200,
    });
  }, [visible, contentHeight, containerHeight, animatedOpacity]);

  // Calculate the indicator height as a percentage of the container height
  // Smaller indicator = more content to scroll through
  const indicatorHeightRatio = Math.max(
    0.05, // Minimum 5% of container height
    Math.min(0.95, containerHeight / contentHeight), // Maximum 95% of container height
  );
  const indicatorHeight = containerHeight * indicatorHeightRatio;

  // Calculate the maximum scroll distance
  const maxScrollY = Math.max(0, contentHeight - containerHeight);

  // Calculate the available space for the indicator to move
  const maxIndicatorY = containerHeight - indicatorHeight;

  const animatedStyle = useAnimatedStyle(() => {
    // Calculate the indicator position based on scroll percentage
    const scrollPercentage =
      maxScrollY > 0 ? animatedScrollY.value / maxScrollY : 0;
    const indicatorY = scrollPercentage * maxIndicatorY;

    return {
      transform: [{ translateY: indicatorY }],
      opacity: animatedOpacity.value,
    };
  });

  return (
    <View className="absolute right-1 top-0 bottom-0 w-1.5 justify-start">
      <Animated.View
        style={[animatedStyle]}
        className="w-full rounded-full bg-primary/60"
        // @ts-expect-error - height is a number, not a string, but it works in RN
        style={[animatedStyle, { height: indicatorHeight }]}
      />
    </View>
  );
}
