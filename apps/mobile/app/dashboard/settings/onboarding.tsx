import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import ChevronRight from "@/components/ui/ChevronRight";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import {
  Share2,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react-native";

const IOS_STEPS = [
  {
    title: "Open Safari or your browser",
    description:
      "Navigate to any webpage you want to save to Karakeep in Safari or your preferred browser.",
    icon: "🌐",
  },
  {
    title: "Tap the Share button",
    description:
      'Look for the share icon (a square with an arrow pointing up) at the bottom of Safari or in your browser\'s menu.',
    icon: "📤",
  },
  {
    title: "Scroll down and tap 'Karakeep'",
    description:
      "In the share sheet, scroll down through the list of apps. Tap on 'Karakeep' to save the page.",
    icon: "✨",
  },
  {
    title: "First time: Enable the extension",
    description:
      "If this is your first time, you may need to scroll to the bottom, tap 'Edit Actions', and enable Karakeep from the list.",
    icon: "⚙️",
  },
];

const ANDROID_STEPS = [
  {
    title: "Open Chrome or your browser",
    description:
      "Navigate to any webpage you want to save to Karakeep in Chrome or your preferred browser.",
    icon: "🌐",
  },
  {
    title: "Tap the Share button",
    description:
      "Look for the share icon (usually three connected dots or a share symbol) in your browser's menu.",
    icon: "📤",
  },
  {
    title: "Select 'Karakeep' from the list",
    description:
      "In the share menu, look for Karakeep in the list of apps and tap on it to save the page.",
    icon: "✨",
  },
  {
    title: "Pin Karakeep for quick access",
    description:
      "For faster access in the future, you can pin Karakeep to the top of your share menu by long-pressing the Karakeep icon and selecting 'Pin'.",
    icon: "📌",
  },
];

export default function OnboardingPage() {
  const { settings, setSettings } = useAppSettings();
  const [currentStep, setCurrentStep] = useState(0);
  const steps = Platform.OS === "ios" ? IOS_STEPS : ANDROID_STEPS;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      // Mark onboarding as complete
      setSettings({ ...settings, hasSeenOnboarding: true });
      router.back();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    setSettings({ ...settings, hasSeenOnboarding: true });
    router.back();
  };

  return (
    <CustomSafeAreaView>
      <ScrollView className="flex-1">
        <View className="flex h-full w-full items-center px-6 py-8">
          {/* Header */}
          <View className="mb-8 w-full items-center">
            <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Share2 size={40} color="rgb(0, 122, 255)" />
            </View>
            <Text variant="largeTitle" className="mb-2 text-center font-bold">
              Add to Share Menu
            </Text>
            <Text
              variant="body"
              color="secondary"
              className="text-center"
            >
              Save web pages to Karakeep directly from {Platform.OS === "ios" ? "Safari" : "Chrome"}
            </Text>
          </View>

          {/* Progress indicators */}
          <View className="mb-8 flex w-full flex-row items-center justify-center gap-2">
            {steps.map((_, index) => (
              <View
                key={index}
                className={`h-2 rounded-full ${
                  index === currentStep
                    ? "w-8 bg-primary"
                    : index < currentStep
                      ? "w-2 bg-primary/50"
                      : "w-2 bg-muted"
                }`}
              />
            ))}
          </View>

          {/* Current step */}
          <View className="mb-8 w-full rounded-xl bg-card p-6">
            <View className="mb-4 items-center">
              <Text className="text-6xl">{steps[currentStep].icon}</Text>
            </View>
            <Text variant="title2" className="mb-3 font-bold">
              Step {currentStep + 1}: {steps[currentStep].title}
            </Text>
            <Text variant="body" color="secondary" className="leading-6">
              {steps[currentStep].description}
            </Text>
          </View>

          {/* All steps overview */}
          <View className="mb-8 w-full">
            <Text variant="heading" className="mb-4">
              All Steps:
            </Text>
            {steps.map((step, index) => (
              <View
                key={index}
                className={`mb-3 flex flex-row items-start gap-3 rounded-lg p-3 ${
                  index === currentStep ? "bg-primary/5" : ""
                }`}
              >
                {index < currentStep ? (
                  <CheckCircle2 size={24} color="rgb(52, 199, 89)" />
                ) : (
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-muted">
                    <Text variant="caption1" className="font-semibold">
                      {index + 1}
                    </Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text
                    variant="subhead"
                    className={`font-semibold ${
                      index === currentStep ? "text-primary" : ""
                    }`}
                  >
                    {step.title}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Navigation buttons */}
          <View className="w-full gap-3">
            <View className="flex flex-row gap-3">
              <Button
                androidRootClassName="flex-1"
                variant="secondary"
                onPress={handlePrevious}
                disabled={currentStep === 0}
                className="flex-1"
              >
                <ChevronLeft size={20} />
                <Text>Previous</Text>
              </Button>
              <Button
                androidRootClassName="flex-1"
                variant="primary"
                onPress={handleNext}
                className="flex-1"
              >
                <Text>{isLastStep ? "Done" : "Next"}</Text>
                {!isLastStep && <ChevronRight size={20} color="white" />}
              </Button>
            </View>
            <Button
              androidRootClassName="w-full"
              variant="plain"
              onPress={handleSkip}
            >
              <Text>Skip for now</Text>
            </Button>
          </View>
        </View>
      </ScrollView>
    </CustomSafeAreaView>
  );
}
