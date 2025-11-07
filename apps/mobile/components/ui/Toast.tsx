import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { cn } from "@/lib/utils";

const toastVariants = {
  default: "bg-foreground",
  destructive: "bg-destructive",
  success: "bg-green-500",
  info: "bg-blue-500",
};

interface ToastProps {
  id: number;
  message: string;
  onHide: (id: number) => void;
  variant?: keyof typeof toastVariants;
  duration?: number;
  showProgress?: boolean;
}
function Toast({
  id,
  message,
  onHide,
  variant = "default",
  duration = 3000,
  showProgress = true,
}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: duration - 1000,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => onHide(id));
  }, [duration]);

  return (
    <Animated.View
      className={`
        ${toastVariants[variant]}
        m-2 mb-1 transform rounded-lg p-4 transition-all
      `}
      style={{
        opacity,
        transform: [
          {
            translateY: opacity.interpolate({
              inputRange: [0, 1],
              outputRange: [-20, 0],
            }),
          },
        ],
      }}
    >
      <Text className="text-left font-semibold text-background">{message}</Text>
      {showProgress && (
        <View className="mt-2 rounded">
          <Animated.View
            className="h-2 rounded bg-white opacity-30 dark:bg-black"
            style={{
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            }}
          />
        </View>
      )}
    </Animated.View>
  );
}

type ToastVariant = keyof typeof toastVariants;

interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
  duration?: number;
  position?: string;
  showProgress?: boolean;
}
interface ToastContextProps {
  toast: (t: {
    message: string;
    variant?: keyof typeof toastVariants;
    duration?: number;
    position?: "top" | "bottom";
    showProgress?: boolean;
  }) => void;
  removeToast: (id: number) => void;
}
const ToastContext = createContext<ToastContextProps | undefined>(undefined);

// TODO: refactor to pass position to Toast instead of ToastProvider
function ToastProvider({
  children,
  position = "top",
}: {
  children: React.ReactNode;
  position?: "top" | "bottom";
}) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast: ToastContextProps["toast"] = ({
    message,
    variant = "default",
    duration = 3000,
    position = "top",
    showProgress = true,
  }: {
    message: string;
    variant?: ToastVariant;
    duration?: number;
    position?: "top" | "bottom";
    showProgress?: boolean;
  }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: message,
        variant,
        duration,
        position,
        showProgress,
      },
    ]);
  };

  const removeToast = (id: number) => {
    setMessages((prev) => prev.filter((message) => message.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast, removeToast }}>
      {children}
      <View
        className={cn("absolute left-0 right-0", {
          "top-[45px]": position === "top",
          "bottom-0": position === "bottom",
        })}
      >
        {messages.map((message) => (
          <Toast
            key={message.id}
            id={message.id}
            message={message.text}
            variant={message.variant}
            duration={message.duration}
            showProgress={message.showProgress}
            onHide={removeToast}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export { ToastProvider, ToastVariant, Toast, toastVariants, useToast };
