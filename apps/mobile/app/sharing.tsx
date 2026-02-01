import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { api } from "@/lib/trpc";
import { useUploadAsset } from "@/lib/upload";
import { AlertCircle, Archive, Check } from "lucide-react-native";
import { z } from "zod";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

type Mode =
  | { type: "idle" }
  | { type: "success"; bookmarkId: string }
  | { type: "alreadyExists"; bookmarkId: string }
  | { type: "error" };

function SaveBookmark({ setMode }: { setMode: (mode: Mode) => void }) {
  const onSaved = (d: ZBookmark & { alreadyExists: boolean }) => {
    invalidateAllBookmarks();
    setMode({
      type: d.alreadyExists ? "alreadyExists" : "success",
      bookmarkId: d.id,
    });
  };

  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  const { settings, isLoading } = useAppSettings();
  const { uploadAsset } = useUploadAsset(settings, {
    onSuccess: onSaved,
    onError: () => {
      setMode({ type: "error" });
    },
  });

  const invalidateAllBookmarks =
    api.useUtils().bookmarks.getBookmarks.invalidate;

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!isPending && shareIntent.webUrl) {
      mutate({
        type: BookmarkTypes.LINK,
        url: shareIntent.webUrl,
        source: "mobile",
      });
    } else if (!isPending && shareIntent?.text) {
      const val = z.string().url();
      if (val.safeParse(shareIntent.text).success) {
        // This is a URL, else treated as text
        mutate({
          type: BookmarkTypes.LINK,
          url: shareIntent.text,
          source: "mobile",
        });
      } else {
        mutate({
          type: BookmarkTypes.TEXT,
          text: shareIntent.text,
          source: "mobile",
        });
      }
    } else if (!isPending && shareIntent?.files) {
      uploadAsset({
        type: shareIntent.files[0].mimeType,
        name: shareIntent.files[0].fileName ?? "",
        uri: shareIntent.files[0].path,
      });
    }
    if (hasShareIntent) {
      resetShareIntent();
    }
  }, [isLoading]);

  const { mutate, isPending } = api.bookmarks.createBookmark.useMutation({
    onSuccess: onSaved,
    onError: () => {
      setMode({ type: "error" });
    },
  });

  return null;
}

// Animated loading indicator with pulsing archive icon
function LoadingAnimation() {
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(0.6);
  const dotOpacity1 = useSharedValue(0);
  const dotOpacity2 = useSharedValue(0);
  const dotOpacity3 = useSharedValue(0);

  useEffect(() => {
    // Gentle pulse animation
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    // Subtle rotation wobble
    rotation.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    // Opacity pulse
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.6, { duration: 800 }),
      ),
      -1,
      false,
    );

    // Animated dots for "Hoarding..."
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

// Individual particle component to avoid hooks in callback
function Particle({
  angle,
  delay,
  color,
}: {
  angle: number;
  delay: number;
  color: string;
}) {
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

// Animated success checkmark with celebration effect
function SuccessAnimation({
  isAlreadyExists,
}: {
  isAlreadyExists: boolean;
}) {
  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);

  const particleColor = isAlreadyExists
    ? "rgb(255, 180, 0)"
    : "rgb(0, 200, 100)";

  useEffect(() => {
    // Haptic feedback
    Haptics.notificationAsync(
      isAlreadyExists
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success,
    );

    // Ring expansion animation
    ringScale.value = withSequence(
      withTiming(1.2, { duration: 400, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 200 }),
    );
    ringOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withDelay(300, withTiming(0.3, { duration: 300 })),
    );

    // Checkmark bounce in
    checkScale.value = withDelay(
      150,
      withSpring(1, {
        damping: 12,
        stiffness: 200,
        mass: 0.8,
      }),
    );
    checkOpacity.value = withDelay(150, withTiming(1, { duration: 200 }));
  }, []);

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
      {/* Particle burst */}
      {Array.from({ length: 8 }, (_, i) => (
        <Particle
          key={i}
          angle={(i * 360) / 8}
          delay={i * 50}
          color={particleColor}
        />
      ))}

      {/* Expanding ring */}
      <Animated.View
        style={ringStyle}
        className={`absolute h-28 w-28 rounded-full ${
          isAlreadyExists ? "bg-yellow-500/20" : "bg-green-500/20"
        }`}
      />

      {/* Main circle with icon */}
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

// Error animation
function ErrorAnimation() {
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

export default function Sharing() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ type: "idle" });

  const autoCloseTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto dismiss the modal after saving.
  useEffect(() => {
    if (mode.type === "idle") {
      return;
    }

    autoCloseTimeoutId.current = setTimeout(
      () => {
        router.replace("dashboard");
      },
      mode.type === "error" ? 3000 : 2500,
    );

    return () => {
      if (autoCloseTimeoutId.current) {
        clearTimeout(autoCloseTimeoutId.current);
      }
    };
  }, [mode.type]);

  const handleManage = () => {
    if (mode.type === "success" || mode.type === "alreadyExists") {
      router.replace(`/dashboard/bookmarks/${mode.bookmarkId}/info`);
      if (autoCloseTimeoutId.current) {
        clearTimeout(autoCloseTimeoutId.current);
      }
    }
  };

  const handleDismiss = () => {
    if (autoCloseTimeoutId.current) {
      clearTimeout(autoCloseTimeoutId.current);
    }
    router.replace("dashboard");
  };

  return (
    <View className="flex-1 items-center justify-center bg-background">
      {/* Hidden component that handles the save logic */}
      {mode.type === "idle" && <SaveBookmark setMode={setMode} />}

      {/* Loading State */}
      {mode.type === "idle" && <LoadingAnimation />}

      {/* Success State */}
      {(mode.type === "success" || mode.type === "alreadyExists") && (
        <Animated.View
          entering={FadeIn.duration(200)}
          className="items-center gap-6"
        >
          <SuccessAnimation isAlreadyExists={mode.type === "alreadyExists"} />

          <Animated.View
            entering={FadeIn.delay(400).duration(300)}
            className="items-center gap-2"
          >
            <Text variant="title1" className="font-semibold text-foreground">
              {mode.type === "alreadyExists" ? "Already Hoarded!" : "Hoarded!"}
            </Text>
            <Text variant="body" className="text-muted-foreground">
              {mode.type === "alreadyExists"
                ? "This item was saved before"
                : "Saved to your collection"}
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(600).duration(300)}
            className="items-center gap-3 pt-2"
          >
            <Button onPress={handleManage} variant="primary" size="lg">
              <Text className="font-medium text-primary-foreground">
                Manage
              </Text>
            </Button>
            <Pressable
              onPress={handleDismiss}
              className="px-4 py-2 active:opacity-60"
            >
              <Text className="text-muted-foreground">Dismiss</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}

      {/* Error State */}
      {mode.type === "error" && (
        <Animated.View
          entering={FadeIn.duration(200)}
          className="items-center gap-6"
        >
          <ErrorAnimation />

          <Animated.View
            entering={FadeIn.delay(300).duration(300)}
            className="items-center gap-2"
          >
            <Text variant="title1" className="font-semibold text-foreground">
              Oops!
            </Text>
            <Text variant="body" className="text-muted-foreground">
              Something went wrong
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(500).duration(300)}
            className="items-center gap-3 pt-2"
          >
            <Pressable
              onPress={handleDismiss}
              className="px-4 py-2 active:opacity-60"
            >
              <Text className="text-muted-foreground">Dismiss</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}
