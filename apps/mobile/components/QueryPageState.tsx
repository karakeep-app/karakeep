import { useRouter } from "expo-router";
import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useTranslation } from "@/lib/i18n/hooks";
import { useSession } from "@/lib/session";
import useAppSettings from "@/lib/settings";
import { useConnectionStatus } from "@/lib/useConnectionStatus";
import { CloudOff, LogIn, WifiOff } from "lucide-react-native";

export default function QueryPageState({
  error,
  onRetry,
}: {
  error?: { message: string } | null;
  onRetry: () => void;
}) {
  const connectionStatus = useConnectionStatus();
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const router = useRouter();
  const { logout } = useSession();

  if (connectionStatus === "device-offline") {
    return (
      <FullPageError
        icon={WifiOff}
        title={t("offline_state.offline_heading")}
        error={t("offline_state.offline_not_saved_message")}
        onRetry={onRetry}
      />
    );
  }

  if (connectionStatus === "server-unreachable") {
    const server = settings.address?.replace(/^https?:\/\//, "");
    return (
      <FullPageError
        icon={CloudOff}
        title={t("offline_state.server_unreachable_title")}
        error={
          server
            ? t("offline_state.server_unreachable_message", { server })
            : t("offline_state.server_unreachable_message_generic")
        }
        onRetry={onRetry}
        secondaryLabel={t("headers.test_connection")}
        onSecondary={() => router.push("/test-connection")}
      />
    );
  }

  if (error?.message === "UNAUTHORIZED") {
    return (
      <FullPageError
        icon={LogIn}
        title={t("auth.sign_in_again_title")}
        error={t("auth.sign_in_again_message")}
        secondaryLabel={t("auth.sign_in")}
        onSecondary={() => void logout()}
      />
    );
  }

  if (error) {
    return <FullPageError error={error.message} onRetry={onRetry} />;
  }

  return <FullPageSpinner />;
}
