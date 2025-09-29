import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/trpc";
import { RefreshCw, Undo2 } from "lucide-react-native";

import BookmarkCard from "../bookmarks/BookmarkCard";

const { width: screenWidth } = Dimensions.get("window");
const SWIPE_THRESHOLD = screenWidth * 0.25;

interface LastAction {
  type: "archived" | "quick_actions" | "skipped";
  bookmarkId: string;
  timestamp: number;
}

export default function RediscoveryScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);

  const { toast } = useToast();
  const apiUtils = api.useUtils();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // tRPC hooks
  const { data: accessData, isLoading: isCheckingAccess } =
    api.rediscovery.canAccess.useQuery();
  const { data: feedData, isLoading: isFeedLoading } =
    api.rediscovery.getDiscoveryFeed.useQuery(undefined, {
      enabled: accessData?.canAccess === true,
    });

  const regenerateMutation =
    api.rediscovery.regenerateDiscoveryFeed.useMutation({
      onSuccess: () => {
        setCurrentIndex(0);
        setLastAction(null);
        toast({
          message: "Discovery feed regenerated!",
          showProgress: false,
        });
        // Invalidate and refetch to update the UI
        apiUtils.rediscovery.getDiscoveryFeed.invalidate();
      },
      onError: (error) => {
        console.error("Failed to regenerate feed:", error);
        toast({
          message: "Failed to regenerate feed",
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const resetHistoryMutation =
    api.rediscovery.resetRediscoveryHistory.useMutation({
      onSuccess: (data) => {
        setCurrentIndex(0);
        setLastAction(null);
        toast({
          message: `Reset complete! ${data.resetCount} bookmarks are now available for rediscovery.`,
          showProgress: false,
        });
        // Invalidate and refetch to update the UI
        apiUtils.rediscovery.getDiscoveryFeed.invalidate();
        apiUtils.rediscovery.canAccess.invalidate();
      },
      onError: (error) => {
        console.error("Failed to reset rediscovery history:", error);
        toast({
          message: "Failed to reset rediscovery history",
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const swipeActionMutation = api.rediscovery.processSwipeAction.useMutation({
    onSuccess: (result, variables) => {
      // Update last action for undo functionality
      if (
        variables.direction === "left" ||
        variables.direction === "right" ||
        variables.direction === "up"
      ) {
        setLastAction({
          type: result.action as "archived" | "quick_actions" | "skipped",
          bookmarkId: variables.bookmarkId,
          timestamp: Date.now(),
        });
      }

      // Move to next card for left, right, up
      if (
        variables.direction === "left" ||
        variables.direction === "right" ||
        variables.direction === "up"
      ) {
        setCurrentIndex((prev) => prev + 1);
      }
      // For down, go to previous card
      else if (variables.direction === "down" && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }

      // Show success message
      const actionMessages = {
        archived: "Bookmark archived!",
        quick_actions: "Quick action applied!",
        skipped: "Bookmark skipped!",
        returned: "Returned to previous bookmark",
      };

      toast({
        message:
          actionMessages[result.action as keyof typeof actionMessages] ||
          "Action completed!",
        showProgress: false,
        duration: result.action === "skipped" ? 1500 : 3000,
      });

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    onError: (error) => {
      console.error("Failed to process swipe:", error);
      toast({
        message: "Failed to process action",
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const undoMutation = api.rediscovery.undoLastAction.useMutation({
    onSuccess: () => {
      // Move back to previous card
      setCurrentIndex((prev) => Math.max(0, prev - 1));
      setLastAction(null);

      toast({
        message: "Action undone!",
        showProgress: false,
      });
    },
    onError: (error) => {
      console.error("Failed to undo action:", error);
      toast({
        message: "Failed to undo action",
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const bookmarks = feedData?.bookmarks || [];
  const isLoading = isCheckingAccess || isFeedLoading;
  const canAccess = accessData?.canAccess || false;
  const message = accessData?.message || "";
  const allRecentlyRediscovered =
    accessData?.allRecentlyRediscovered ||
    feedData?.allRecentlyRediscovered ||
    false;

  const handleSwipe = (direction: "left" | "right" | "up" | "down") => {
    if (currentIndex >= bookmarks.length) return;

    const currentBookmark = bookmarks[currentIndex];
    if (!currentBookmark) return;

    swipeActionMutation.mutate({
      bookmarkId: currentBookmark.id,
      direction,
    });
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      scale.value = withSpring(1.05);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const { translationX, translationY, velocityX, velocityY } = event;

      scale.value = withSpring(1);

      // Determine swipe direction based on translation and velocity
      const isHorizontalSwipe = Math.abs(translationX) > Math.abs(translationY);
      const isSignificantSwipe =
        Math.abs(translationX) > SWIPE_THRESHOLD ||
        Math.abs(translationY) > SWIPE_THRESHOLD ||
        Math.abs(velocityX) > 500 ||
        Math.abs(velocityY) > 500;

      if (isSignificantSwipe) {
        if (isHorizontalSwipe) {
          if (translationX > 0) {
            // Swipe right
            translateX.value = withSpring(screenWidth);
            runOnJS(handleSwipe)("right");
          } else {
            // Swipe left
            translateX.value = withSpring(-screenWidth);
            runOnJS(handleSwipe)("left");
          }
        } else {
          if (translationY < 0) {
            // Swipe up
            translateY.value = withSpring(-screenWidth);
            runOnJS(handleSwipe)("up");
          } else {
            // Swipe down
            translateY.value = withSpring(screenWidth);
            runOnJS(handleSwipe)("down");
          }
        }
      } else {
        // Return to center
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const rotateZ = interpolate(
      translateX.value,
      [-screenWidth, 0, screenWidth],
      [-30, 0, 30],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      Math.abs(translateX.value) + Math.abs(translateY.value),
      [0, SWIPE_THRESHOLD],
      [1, 0.7],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotateZ: `${rotateZ}deg` },
        { scale: scale.value },
      ],
      opacity,
    };
  });

  const undoLastAction = () => {
    if (!lastAction) return;

    undoMutation.mutate({
      bookmarkId: lastAction.bookmarkId,
      action: lastAction.type,
    });
  };

  const regenerateFeed = () => {
    regenerateMutation.mutate();
  };

  const resetRediscoveryHistory = () => {
    resetHistoryMutation.mutate();
  };

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-foreground">
          Loading rediscovery feed...
        </Text>
      </View>
    );
  }

  // Show access denied message
  if (!canAccess) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <View className="max-w-md rounded-xl border border-accent bg-background p-8 text-center">
          <Text className="mb-2 text-lg font-semibold text-foreground">
            Rediscovery Not Available
          </Text>
          <Text className="text-muted-foreground">{message}</Text>
        </View>
      </View>
    );
  }

  // Show empty state
  if (bookmarks.length === 0 || currentIndex >= bookmarks.length) {
    if (allRecentlyRediscovered) {
      // All bookmarks have been recently rediscovered
      return (
        <View className="flex-1 items-center justify-center bg-background p-6">
          <View className="max-w-md rounded-xl border border-accent bg-background p-8 text-center">
            <Text className="mb-4 text-lg font-semibold text-foreground">
              🎉 All Caught Up!
            </Text>
            <Text className="mb-6 text-muted-foreground">
              Excellent work! You&apos;ve rediscovered all your bookmarks
              recently. Want to go through them again?
            </Text>
            <View className="gap-3">
              <Pressable
                onPress={resetRediscoveryHistory}
                disabled={resetHistoryMutation.isPending}
                className="mb-3 flex-row items-center justify-center rounded-lg bg-blue-600 px-4 py-2"
              >
                <RefreshCw color="white" size={16} />
                <Text className="ml-2 font-medium text-white">
                  {resetHistoryMutation.isPending
                    ? "Resetting..."
                    : "Reset & Start Over"}
                </Text>
              </Pressable>
              <Pressable
                onPress={regenerateFeed}
                disabled={regenerateMutation.isPending}
                className="flex-row items-center justify-center rounded-lg border border-accent px-4 py-2"
              >
                <RefreshCw color="gray" size={16} />
                <Text className="ml-2 font-medium text-foreground">
                  Try Generate New Feed
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    } else {
      // Normal empty state - no more bookmarks in current queue
      return (
        <View className="flex-1 items-center justify-center bg-background p-6">
          <View className="max-w-md rounded-xl border border-accent bg-background p-8 text-center">
            <Text className="mb-4 text-lg font-semibold text-foreground">
              No More Bookmarks
            </Text>
            <Text className="mb-6 text-muted-foreground">
              You&apos;ve gone through all available bookmarks in your current
              discovery feed.
            </Text>
            <Pressable
              onPress={regenerateFeed}
              disabled={regenerateMutation.isPending}
              className="flex-row items-center justify-center rounded-lg bg-blue-600 px-4 py-2"
            >
              <RefreshCw color="white" size={16} />
              <Text className="ml-2 font-medium text-white">
                Generate New Feed
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }
  }

  const currentBookmark = bookmarks[currentIndex];

  return (
    <View className="flex-1 bg-background">
      {/* Header with instructions */}
      <View className="border-b border-blue-200 bg-blue-50 p-4">
        <Text className="text-center text-sm text-blue-800">
          💡 Swipe left to archive, right for quick actions, up to skip, down to
          go back
        </Text>
      </View>

      {/* Action buttons */}
      <View className="flex-row items-center justify-between p-4">
        <View className="flex-row gap-2">
          {lastAction && (
            <Pressable
              onPress={undoLastAction}
              disabled={undoMutation.isPending}
              className="flex-row items-center rounded-lg bg-gray-200 px-3 py-2"
            >
              <Undo2 color="gray" size={16} />
              <Text className="ml-2 text-gray-700">Undo</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={regenerateFeed}
          disabled={regenerateMutation.isPending}
          className="flex-row items-center rounded-lg bg-gray-200 px-3 py-2"
        >
          <RefreshCw color="gray" size={16} />
          <Text className="ml-2 text-gray-700">Regenerate</Text>
        </Pressable>
      </View>

      {/* Card stack */}
      <View className="flex-1 items-center justify-center p-4">
        {/* Next card in background */}
        {currentIndex + 1 < bookmarks.length && (
          <View className="absolute inset-4 scale-95 transform opacity-50">
            <BookmarkCard bookmark={bookmarks[currentIndex + 1]} />
          </View>
        )}

        {/* Current card */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[{ width: "100%" }, animatedStyle]}>
            <BookmarkCard bookmark={currentBookmark} />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Progress indicator */}
      <View className="p-4">
        <Text className="mb-2 text-center text-sm text-muted-foreground">
          {currentIndex + 1} of {bookmarks.length} bookmarks
        </Text>
        <View className="h-2 w-full rounded-full bg-gray-200">
          <View
            className="h-2 rounded-full bg-blue-600"
            style={{
              width: `${((currentIndex + 1) / bookmarks.length) * 100}%`,
            }}
          />
        </View>
      </View>
    </View>
  );
}
