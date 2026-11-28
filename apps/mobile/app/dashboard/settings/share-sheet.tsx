import type { LucideIcon } from "lucide-react-native";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { Image } from "expo-image";
import appIcon from "@/assets/icon.png";
import {
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import { AppIcon } from "@/components/ui/AppIcon";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import {
  Ellipsis,
  Pin,
  Search,
  Share2,
  ShareIcon,
  Star,
} from "lucide-react-native";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

function useSteps(): Step[] {
  const { t } = useTranslation();

  if (Platform.OS === "ios") {
    return [
      {
        icon: ShareIcon,
        title: t("share_sheet.ios_step_share_title"),
        body: t("share_sheet.ios_step_share_body"),
      },
      {
        icon: Ellipsis,
        title: t("share_sheet.ios_step_more_title"),
        body: t("share_sheet.ios_step_more_body"),
      },
      {
        icon: Star,
        title: t("share_sheet.ios_step_favorite_title"),
        body: t("share_sheet.ios_step_favorite_body"),
      },
    ];
  }

  return [
    {
      icon: Share2,
      title: t("share_sheet.android_step_share_title"),
      body: t("share_sheet.android_step_share_body"),
    },
    {
      icon: Search,
      title: t("share_sheet.android_step_find_title"),
      body: t("share_sheet.android_step_find_body"),
    },
    {
      icon: Pin,
      title: t("share_sheet.android_step_pin_title"),
      body: t("share_sheet.android_step_pin_body"),
    },
  ];
}

/**
 * A sketch of the share sheet's app row with Karakeep in front, so people know
 * what they're looking for once they tap Share.
 */
function ShareSheetIllustration() {
  const { colors } = useColorScheme();

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="flex-row items-start justify-center gap-4 rounded-2xl bg-card px-4 py-4"
      style={{ borderCurve: "continuous" }}
    >
      <View className="items-center gap-1.5">
        <Image
          source={appIcon}
          style={{ width: 52, height: 52, borderRadius: 12 }}
        />
        <Text variant="caption2">Karakeep</Text>
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} className="items-center gap-1.5 opacity-40">
          <View
            className="h-[52px] w-[52px] rounded-xl bg-muted"
            style={{ borderCurve: "continuous" }}
          />
          <View className="mt-1 h-2 w-9 rounded-full bg-muted" />
        </View>
      ))}
      {Platform.OS === "ios" ? (
        <View className="items-center gap-1.5 opacity-60">
          <View className="h-[52px] w-[52px] items-center justify-center rounded-full bg-muted">
            <AppIcon icon={Ellipsis} size={22} color={colors.foreground} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function ShareSheetGuide() {
  const { t } = useTranslation();
  const { colors } = useColorScheme();
  const { settings, setSettings, isLoading } = useAppSettings();
  const steps = useSteps();

  // Once people have found the guide, the home tip has done its job.
  useEffect(() => {
    if (!isLoading && !settings.shareSheetTipSeen) {
      void setSettings({ ...settings, shareSheetTipSeen: true });
    }
  }, [isLoading]);

  return (
    <SettingsScreen>
      <View className="items-center gap-2 px-4 pt-2">
        <Text variant="title2" className="text-center font-semibold">
          {t("share_sheet.guide_title")}
        </Text>
        <Text variant="subhead" color="tertiary" className="text-center">
          {t("share_sheet.guide_subtitle")}
        </Text>
      </View>

      <ShareSheetIllustration />

      <SettingsGroup
        header={t("share_sheet.steps_header")}
        footer={t("share_sheet.supported_types")}
      >
        {steps.map((step, index) => (
          <View key={step.title}>
            {index > 0 ? <SettingsSeparator /> : null}
            <View className="flex-row items-start gap-3 px-4 py-3">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <AppIcon icon={step.icon} size={16} color={colors.primary} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="subhead" className="font-semibold">
                  {`${index + 1}. ${step.title}`}
                </Text>
                <Text variant="subhead" color="tertiary">
                  {step.body}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </SettingsGroup>
    </SettingsScreen>
  );
}
