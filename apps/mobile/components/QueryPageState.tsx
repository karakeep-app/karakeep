import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
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

  if (connectionStatus === "device-offline") {
    return (
      <FullPageError
        icon={WifiOff}
        title="You're offline"
        error="This page isn't available while you're offline. Reconnect to load it."
        detail={error?.message}
        onRetry={onRetry}
      />
    );
  }

  if (connectionStatus === "server-unreachable") {
    return (
      <FullPageError
        icon={CloudOff}
        title="Karakeep is unavailable"
        error="Karakeep couldn't be reached. Try again in a moment."
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
