import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Slider from "@react-native-community/slider";
import {
  ReaderPreview,
  ReaderPreviewRef,
} from "@/components/reader/ReaderPreview";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import { MOBILE_FONT_FAMILIES, useReaderSettings } from "@/lib/readerSettings";
import { useColorScheme } from "@/lib/useColorScheme";
import { Check, RotateCcw } from "lucide-react-native";

import {
  formatFontFamily,
  formatFontSize,
  formatLineHeight,
  READER_SETTING_CONSTRAINTS,
} from "@karakeep/shared/types/readers";
import { ZReaderFontFamily } from "@karakeep/shared/types/users";

export default function ReaderSettingsPage() {
  const { isDarkColorScheme: isDark } = useColorScheme();

  const {
    settings,
    localOverrides,
    hasLocalOverrides,
    hasServerDefaults,
    updateLocal,
    clearAllLocal,
    saveAsDefault,
    clearAllDefaults,
  } = useReaderSettings();

  const {
    fontSize: effectiveFontSize,
    lineHeight: effectiveLineHeight,
    fontFamily: effectiveFontFamily,
  } = settings;

  // Display values for showing rounded values while dragging
  const [displayFontSize, setDisplayFontSize] = useState(effectiveFontSize);
  const [displayLineHeight, setDisplayLineHeight] =
    useState(effectiveLineHeight);

  // Refs to track latest display values (avoids stale closures in callbacks)
  const displayFontSizeRef = useRef(displayFontSize);
  displayFontSizeRef.current = displayFontSize;
  const displayLineHeightRef = useRef(displayLineHeight);
  displayLineHeightRef.current = displayLineHeight;

  // Ref for the WebView preview component
  const previewRef = useRef<ReaderPreviewRef>(null);

  // Functions to update preview styles
  const updatePreviewFontSize = useCallback(
    (fontSize: number) => {
      setDisplayFontSize(fontSize);
      previewRef.current?.updateStyles(
        effectiveFontFamily,
        fontSize,
        displayLineHeightRef.current,
      );
    },
    [effectiveFontFamily],
  );

  const updatePreviewLineHeight = useCallback(
    (lineHeight: number) => {
      setDisplayLineHeight(lineHeight);
      previewRef.current?.updateStyles(
        effectiveFontFamily,
        displayFontSizeRef.current,
        lineHeight,
      );
    },
    [effectiveFontFamily],
  );

  // Sync display values with effective settings
  useEffect(() => {
    setDisplayFontSize(effectiveFontSize);
  }, [effectiveFontSize]);

  useEffect(() => {
    setDisplayLineHeight(effectiveLineHeight);
  }, [effectiveLineHeight]);

  const handleFontFamilyChange = (fontFamily: ZReaderFontFamily) => {
    updateLocal({ fontFamily });
    // Update preview immediately with new font family
    previewRef.current?.updateStyles(
      fontFamily,
      displayFontSize,
      displayLineHeight,
    );
  };

  const handleFontSizeChange = (value: number) => {
    updateLocal({ fontSize: Math.round(value) });
  };

  const handleLineHeightChange = (value: number) => {
    updateLocal({ lineHeight: Math.round(value * 10) / 10 });
  };

  const handleSaveAsDefault = () => {
    saveAsDefault();
    // Note: clearAllLocal is called automatically in the shared hook's onSuccess
  };

  const handleClearLocalOverrides = () => {
    clearAllLocal();
  };

  const handleClearServerDefaults = () => {
    clearAllDefaults();
  };

  const fontFamilyOptions: ZReaderFontFamily[] = ["serif", "sans", "mono"];

  return (
    <ScrollView
      className="w-full"
      contentContainerClassName="items-center gap-4 px-4 py-2"
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* Font Family Selection */}
      <View className="w-full">
        <Text className="mb-2 px-1 text-sm font-medium text-muted-foreground">
          Font Family
          {localOverrides.fontFamily !== undefined && (
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
          {localOverrides.fontSize !== undefined && (
            <Text className="text-blue-500"> (local)</Text>
          )}
        </Text>
        <View className="flex w-full flex-row items-center gap-3 rounded-lg bg-card px-4 py-3">
          <Text className="text-muted-foreground">
            {READER_SETTING_CONSTRAINTS.fontSize.min}
          </Text>
          <Slider
            style={{ height: 40, flex: 1 }}
            value={displayFontSize}
            minimumValue={READER_SETTING_CONSTRAINTS.fontSize.min}
            maximumValue={READER_SETTING_CONSTRAINTS.fontSize.max}
            onValueChange={(value) => updatePreviewFontSize(Math.round(value))}
            onSlidingComplete={(value) =>
              handleFontSizeChange(Math.round(value))
            }
          />
          <Text className="text-muted-foreground">
            {READER_SETTING_CONSTRAINTS.fontSize.max}
          </Text>
        </View>
      </View>

      {/* Line Height */}
      <View className="w-full">
        <Text className="mb-2 px-1 text-sm font-medium text-muted-foreground">
          Line Height ({formatLineHeight(displayLineHeight)})
          {localOverrides.lineHeight !== undefined && (
            <Text className="text-blue-500"> (local)</Text>
          )}
        </Text>
        <View className="flex w-full flex-row items-center gap-3 rounded-lg bg-card px-4 py-3">
          <Text className="text-muted-foreground">
            {READER_SETTING_CONSTRAINTS.lineHeight.min}
          </Text>
          <Slider
            style={{ height: 40, flex: 1 }}
            value={displayLineHeight}
            minimumValue={READER_SETTING_CONSTRAINTS.lineHeight.min}
            maximumValue={READER_SETTING_CONSTRAINTS.lineHeight.max}
            onValueChange={(value) =>
              updatePreviewLineHeight(Math.round(value * 10) / 10)
            }
            onSlidingComplete={handleLineHeightChange}
          />
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
        <ReaderPreview
          ref={previewRef}
          initialFontFamily={effectiveFontFamily}
          initialFontSize={effectiveFontSize}
          initialLineHeight={effectiveLineHeight}
        />
      </View>

      <Divider orientation="horizontal" className="my-2 w-full" />

      {/* Save as Default */}
      <Pressable
        onPress={handleSaveAsDefault}
        disabled={!hasLocalOverrides}
        className="w-full rounded-lg bg-card px-4 py-3"
      >
        <Text
          className={`text-center ${hasLocalOverrides ? "text-blue-500" : "text-muted-foreground"}`}
        >
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
    </ScrollView>
  );
}
