import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useTranslation } from "@/lib/i18n/hooks";
import { useConnectionStatus } from "@/lib/useConnectionStatus";
import { CloudOff, WifiOff } from "lucide-react-native";

export default function QueryPageState({
  error,
  onRetry,
}: {
  error?: { message: string } | null;
  onRetry: () => void;
}) {
  const connectionStatus = useConnectionStatus();
  const { t } = useTranslation();

  if (connectionStatus === "device-offline") {
    return (
      <FullPageError
        icon={WifiOff}
        title={t("offline_state.offline_title")}
        error={t("offline_state.offline_message")}
        detail={error?.message}
        onRetry={onRetry}
      />
    );
  }

  if (connectionStatus === "server-unreachable") {
    return (
      <FullPageError
        icon={CloudOff}
        title={t("offline_state.unreachable_title")}
        error={t("offline_state.unreachable_message")}
        detail={error?.message}
        onRetry={onRetry}
      />
    );
  }

  if (error) {
    return <FullPageError error={error.message} onRetry={onRetry} />;
  }

  return <FullPageSpinner />;
}
