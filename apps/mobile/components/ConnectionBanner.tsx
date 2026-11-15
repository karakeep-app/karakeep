import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { useConnectionStatus } from "@/lib/useConnectionStatus";
import { CloudOff, WifiOff } from "lucide-react-native";

/**
 * Says up front that the feed is a saved copy, rather than letting people find
 * out when an action fails.
 */
export function ConnectionBanner() {
  const status = useConnectionStatus();
  const { colors } = useColorScheme();
  const { t } = useTranslation();

  if (status !== "device-offline" && status !== "server-unreachable") {
    return null;
  }

  const Icon = status === "device-offline" ? WifiOff : CloudOff;

  return (
    <View
      accessibilityRole="alert"
      className="mb-2.5 flex-row items-center gap-2 rounded-xl bg-card px-3 py-2"
      style={{ borderCurve: "continuous" }}
    >
      <Icon size={15} color={colors.grey} />
      <Text variant="footnote" color="tertiary" className="flex-1">
        {status === "device-offline"
          ? t("offline_state.banner_offline")
          : t("offline_state.banner_unreachable")}
      </Text>
    </View>
  );
}
