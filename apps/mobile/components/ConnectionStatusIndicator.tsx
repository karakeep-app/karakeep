import { View } from "react-native";
import { useTranslation } from "@/lib/i18n/hooks";
import { CloudOff } from "lucide-react-native";

import { useConnectionStatus } from "@/lib/useConnectionStatus";

export function ConnectionStatusIndicator() {
  const status = useConnectionStatus();
  const { t } = useTranslation();

  if (status === "online" || status === "checking") {
    return null;
  }

  const label =
    status === "device-offline"
      ? t("offline_state.device_offline")
      : t("offline_state.server_unavailable");

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      accessibilityRole="text"
      className="absolute -bottom-1 -right-1 h-4 w-4 items-center justify-center rounded-full border border-background bg-muted"
    >
      <CloudOff size={10} strokeWidth={2.5} className="text-muted-foreground" />
    </View>
  );
}
