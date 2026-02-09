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
      duration = 3000,
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

export { ToastVariant, toastVariants, useToast };
