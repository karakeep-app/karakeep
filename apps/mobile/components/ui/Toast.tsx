import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/Text";
import { i18n } from "@/lib/i18n";
import { toast as sonnerToast } from "sonner-native";

const toastVariants = {
  default: "bg-foreground",
  destructive: "bg-destructive",
  success: "bg-green-500",
  info: "bg-blue-500",
};

type ToastVariant = keyof typeof toastVariants;

// Compatibility wrapper for sonner-native
function useToast() {
  return {
    toast: ({
      message,
      variant = "default",
      // Errors usually explain something, so they get time to be read.
      duration = variant === "destructive" ? 5000 : 3000,
    }: {
      message: string;
      variant?: ToastVariant;
      duration?: number;
      position?: "top" | "bottom";
      showProgress?: boolean;
    }) => {
      // Map variants to sonner-native methods
      switch (variant) {
        case "success":
          sonnerToast.success(message, { duration });
          break;
        case "destructive":
          sonnerToast.error(message, { duration });
          break;
        case "info":
          sonnerToast.info(message, { duration });
          break;
        default:
          sonnerToast(message, { duration });
      }
    },
    removeToast: () => {
      // sonner-native handles dismissal automatically
    },
  };
}

const ACTION_TOAST_DURATION_MS = 5000;
const ORGANIZE_TOAST_DURATION_MS = 8000;

function ActionToast({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View
      className="mx-4 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg shadow-black/20 dark:bg-[#3a3a3c]"
      style={{ borderCurve: "continuous" }}
    >
      <Text variant="subhead" className="flex-1" numberOfLines={1}>
        {message}
      </Text>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction}>
        <Text variant="subhead" className="font-semibold text-primary">
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

/** A confirmation with one follow-up action next to it. */
function showActionToast(
  message: string,
  actionLabel: string,
  onAction: () => void,
  duration = ACTION_TOAST_DURATION_MS,
) {
  const id = sonnerToast.custom(
    <ActionToast
      message={message}
      actionLabel={actionLabel}
      onAction={() => {
        sonnerToast.dismiss(id);
        onAction();
      }}
    />,
    { duration },
  );
}

/** Confirms a save, and offers to file what was just saved. */
function showOrganizeToast(message: string, bookmarkId: string) {
  showActionToast(
    message,
    i18n.t("actions.organize"),
    () => router.push(`/dashboard/bookmarks/${bookmarkId}/info`),
    ORGANIZE_TOAST_DURATION_MS,
  );
}

/** Lets a quick, unconfirmed action be taken back straight away. */
function showUndoToast(message: string, onUndo: () => void) {
  showActionToast(message, i18n.t("actions.undo"), onUndo);
}

export {
  showActionToast,
  showOrganizeToast,
  showUndoToast,
  ToastVariant,
  toastVariants,
  useToast,
};
