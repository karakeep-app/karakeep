import { Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/ui/AppIcon";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import { Share2, ShareIcon, X } from "lucide-react-native";

/**
 * Many people never find out that Karakeep is in the share sheet, so point it
 * out until they've used it, opened the guide, or dismissed this.
 */
export function ShareSheetTip() {
  const { settings, setSettings, isLoading } = useAppSettings();
  const { colors } = useColorScheme();
  const { t } = useTranslation();

  if (isLoading || settings.shareSheetTipSeen) {
    return null;
  }

  return (
    <View
      className="mb-2.5 flex-row items-start gap-3 rounded-xl bg-card py-3 pl-3"
      style={{ borderCurve: "continuous" }}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
        <AppIcon
          icon={Platform.OS === "ios" ? ShareIcon : Share2}
          size={17}
          color={colors.primary}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="subhead" className="font-semibold">
          {t("share_sheet.tip_title")}
        </Text>
        <Text variant="footnote" color="tertiary">
          {t("share_sheet.tip_body")}
        </Text>
        <Pressable
          accessibilityRole="button"
          className="self-start pt-1.5 active:opacity-60"
          hitSlop={8}
          onPress={() => router.push("/dashboard/settings/share-sheet")}
        >
          <Text variant="subhead" className="font-medium text-primary">
            {t("share_sheet.tip_action")}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("share_sheet.tip_dismiss")}
        className="px-3 active:opacity-60"
        hitSlop={8}
        onPress={() => setSettings({ ...settings, shareSheetTipSeen: true })}
      >
        <AppIcon icon={X} size={15} color={colors.grey} />
      </Pressable>
    </View>
  );
}
