import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { MOBILE_FONT_FAMILIES } from "@/lib/readerSettings";
import useAppSettings from "@/lib/settings";
import { api } from "@/lib/trpc";
import { useColorScheme } from "@/lib/useColorScheme";
import { Check, RotateCcw } from "lucide-react-native";

import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import {
  formatFontFamily,
  formatFontSize,
  formatLineHeight,
  READER_DEFAULTS,
  READER_SETTING_CONSTRAINTS,
} from "@karakeep/shared/types/readers";
import { ZReaderFontFamily } from "@karakeep/shared/types/users";

export default function ReaderSettingsPage() {
  const { toast } = useToast();
  const { isDarkColorScheme: isDark } = useColorScheme();

  // Get local settings directly
  const { settings: localSettings, setSettings } = useAppSettings();

  // Get server settings
  const { data: serverSettings, refetch: refetchServerSettings } =
    api.users.settings.useQuery();
  const { mutate: updateServerSettings } = useUpdateUserSettings();

  // Compute effective settings with precedence: local → server → default
  const effectiveFontSize =
    localSettings.readerFontSize ??
    serverSettings?.readerFontSize ??
    READER_DEFAULTS.fontSize;
  const effectiveLineHeight =
    localSettings.readerLineHeight ??
    serverSettings?.readerLineHeight ??
    READER_DEFAULTS.lineHeight;
  const effectiveFontFamily =
    localSettings.readerFontFamily ??
    serverSettings?.readerFontFamily ??
    READER_DEFAULTS.fontFamily;

  // Shared values for sliders
  const fontSizeProgress = useSharedValue<number>(effectiveFontSize);
  const fontSizeMin = useSharedValue<number>(
    READER_SETTING_CONSTRAINTS.fontSize.min,
  );
  const fontSizeMax = useSharedValue<number>(
    READER_SETTING_CONSTRAINTS.fontSize.max,
  );

  const lineHeightProgress = useSharedValue<number>(effectiveLineHeight);
  const lineHeightMin = useSharedValue<number>(
    READER_SETTING_CONSTRAINTS.lineHeight.min,
  );
  const lineHeightMax = useSharedValue<number>(
    READER_SETTING_CONSTRAINTS.lineHeight.max,
  );

  // Display values for showing rounded values while dragging
  const [displayFontSize, setDisplayFontSize] = useState(effectiveFontSize);
  const [displayLineHeight, setDisplayLineHeight] =
    useState(effectiveLineHeight);

  // Sync slider progress and display values with effective settings
  useEffect(() => {
    fontSizeProgress.value = effectiveFontSize;
    setDisplayFontSize(effectiveFontSize);
  }, [effectiveFontSize]);

  useEffect(() => {
    lineHeightProgress.value = effectiveLineHeight;
    setDisplayLineHeight(effectiveLineHeight);
  }, [effectiveLineHeight]);

  const handleFontFamilyChange = (fontFamily: ZReaderFontFamily) => {
    setSettings({
      ...localSettings,
      readerFontFamily: fontFamily,
    });
  };

  const handleFontSizeChange = (value: number) => {
    setSettings({
      ...localSettings,
      readerFontSize: Math.round(value),
    });
  };

  const handleLineHeightChange = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    setSettings({
      ...localSettings,
      readerLineHeight: rounded,
    });
  };

  const handleSaveAsDefault = () => {
    // Save current effective settings to server
    updateServerSettings(
      {
        readerFontSize: effectiveFontSize,
        readerLineHeight: effectiveLineHeight,
        readerFontFamily: effectiveFontFamily,
      },
      {
        onSuccess: async () => {
          // Refetch server settings to get updated values
          await refetchServerSettings();
          // Clear local overrides after server update succeeds
          setSettings({
            ...localSettings,
            readerFontSize: undefined,
            readerLineHeight: undefined,
            readerFontFamily: undefined,
          });
          toast({
            message: "Reader settings saved as default for all devices",
            showProgress: false,
          });
        },
        onError: () => {
          toast({
            message: "Failed to save settings",
            showProgress: false,
          });
        },
      },
    );
  };

  const handleClearLocalOverrides = () => {
    setSettings({
      ...localSettings,
      readerFontSize: undefined,
      readerLineHeight: undefined,
      readerFontFamily: undefined,
    });
    toast({
      message: "Local overrides cleared",
      showProgress: false,
    });
  };

  const handleClearServerDefaults = () => {
    updateServerSettings({
      readerFontSize: null,
      readerLineHeight: null,
      readerFontFamily: null,
    });
    toast({
      message: "Server defaults cleared",
      showProgress: false,
    });
  };

  const hasLocalOverrides =
    localSettings.readerFontSize !== undefined ||
    localSettings.readerLineHeight !== undefined ||
    localSettings.readerFontFamily !== undefined;

  const hasServerDefaults =
    serverSettings?.readerFontSize != null ||
    serverSettings?.readerLineHeight != null ||
    serverSettings?.readerFontFamily != null;

  const fontFamilyOptions: ZReaderFontFamily[] = ["serif", "sans", "mono"];

  return (
    <CustomSafeAreaView>
      <View className="flex h-full w-full items-center gap-4 px-4 py-2">
        {/* Font Family Selection */}
        <View className="w-full">
          <Text className="mb-2 px-1 text-sm font-medium text-muted-foreground">
            Font Family
            {localSettings.readerFontFamily !== undefined && (
              <Text className="text-blue-500"> (local)</Text>
            )}
          </Text>
          <View className="w-full rounded-lg bg-card px-4 py-2">
            {fontFamilyOptions.map((fontFamily, index) => {
              const isChecked = effectiveFontFamily === fontFamily;
              return (
                <View key={fontFamily}>
                  <Pressable
                    onPress={() => handleFontFamilyChange(fontFamily)}
                    className="flex flex-row items-center justify-between py-2"
                  >
                    <Text
                      style={{
                        fontFamily: MOBILE_FONT_FAMILIES[fontFamily],
                      }}
                    >
                      {formatFontFamily(fontFamily)}
                    </Text>
                    {isChecked && <Check color="rgb(0, 122, 255)" />}
                  </Pressable>
                  {index < fontFamilyOptions.length - 1 && (
                    <Divider orientation="horizontal" className="h-0.5" />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Font Size */}
        <View className="w-full">
          <Text className="mb-2 px-1 text-sm font-medium text-muted-foreground">
            Font Size ({formatFontSize(displayFontSize)})
            {localSettings.readerFontSize !== undefined && (
              <Text className="text-blue-500"> (local)</Text>
            )}
          </Text>
          <View className="flex w-full flex-row items-center gap-3 rounded-lg bg-card px-4 py-3">
            <Text className="text-muted-foreground">
              {READER_SETTING_CONSTRAINTS.fontSize.min}
            </Text>
            <View className="flex-1">
              <Slider
                progress={fontSizeProgress}
                minimumValue={fontSizeMin}
                maximumValue={fontSizeMax}
                renderBubble={() => null}
                onValueChange={(value) => {
                  "worklet";
                  runOnJS(setDisplayFontSize)(Math.round(value));
                }}
                onSlidingComplete={(value) =>
                  handleFontSizeChange(Math.round(value))
                }
              />
            </View>
            <Text className="text-muted-foreground">
              {READER_SETTING_CONSTRAINTS.fontSize.max}
            </Text>
          </View>
        </View>

        {/* Line Height */}
        <View className="w-full">
          <Text className="mb-2 px-1 text-sm font-medium text-muted-foreground">
            Line Height ({formatLineHeight(displayLineHeight)})
            {localSettings.readerLineHeight !== undefined && (
              <Text className="text-blue-500"> (local)</Text>
            )}
          </Text>
          <View className="flex w-full flex-row items-center gap-3 rounded-lg bg-card px-4 py-3">
            <Text className="text-muted-foreground">
              {READER_SETTING_CONSTRAINTS.lineHeight.min}
            </Text>
            <View className="flex-1">
              <Slider
                progress={lineHeightProgress}
                minimumValue={lineHeightMin}
                maximumValue={lineHeightMax}
                renderBubble={() => null}
                onValueChange={(value) => {
                  "worklet";
                  runOnJS(setDisplayLineHeight)(Math.round(value * 10) / 10);
                }}
                onSlidingComplete={handleLineHeightChange}
              />
            </View>
            <Text className="text-muted-foreground">
              {READER_SETTING_CONSTRAINTS.lineHeight.max}
            </Text>
          </View>
        </View>

        {/* Preview */}
        <View className="w-full">
          <Text className="mb-2 px-1 text-sm font-medium text-muted-foreground">
            Preview
          </Text>
          <View className="w-full rounded-lg bg-card px-4 py-3">
            <Text
              style={{
                fontFamily: MOBILE_FONT_FAMILIES[effectiveFontFamily],
                fontSize: effectiveFontSize,
                lineHeight: effectiveFontSize * effectiveLineHeight,
              }}
              className="text-foreground"
            >
              The quick brown fox jumps over the lazy dog. Pack my box with five
              dozen liquor jugs. How vexingly quick daft zebras jump!
            </Text>
          </View>
        </View>

        <Divider orientation="horizontal" className="my-2 w-full" />

        {/* Save as Default */}
        <Pressable
          onPress={handleSaveAsDefault}
          className="w-full rounded-lg bg-card px-4 py-3"
        >
          <Text className="text-center text-blue-500">
            Save as Default (All Devices)
          </Text>
        </Pressable>

        {/* Clear Local */}
        {hasLocalOverrides && (
          <Pressable
            onPress={handleClearLocalOverrides}
            className="flex w-full flex-row items-center justify-center gap-2 rounded-lg bg-card px-4 py-3"
          >
            <RotateCcw size={16} color={isDark ? "#9ca3af" : "#6b7280"} />
            <Text className="text-muted-foreground">Clear Local Overrides</Text>
          </Pressable>
        )}

        {/* Clear Server */}
        {hasServerDefaults && (
          <Pressable
            onPress={handleClearServerDefaults}
            className="flex w-full flex-row items-center justify-center gap-2 rounded-lg bg-card px-4 py-3"
          >
            <RotateCcw size={16} color={isDark ? "#9ca3af" : "#6b7280"} />
            <Text className="text-muted-foreground">Clear Server Defaults</Text>
          </Pressable>
        )}
      </View>
    </CustomSafeAreaView>
  );
}
