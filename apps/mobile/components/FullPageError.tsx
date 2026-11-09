import type { LucideIcon } from "lucide-react-native";
import { Platform, View } from "react-native";
import { AppIcon } from "@/components/ui/AppIcon";
import { useTranslation } from "@/lib/i18n/hooks";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";
import { CircleAlert } from "lucide-react-native";

import { Button } from "./ui/Button";

export default function FullPageError({
  error,
  onRetry,
  secondaryLabel,
  onSecondary,
  title,
  icon: Icon = CircleAlert,
  detail,
}: {
  error: string;
  onRetry?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  title?: string;
  icon?: LucideIcon;
  detail?: string;
}) {
  const { colors } = useColorScheme();
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("offline_state.load_failed_heading");

  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View className="w-full max-w-sm items-center">
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-muted/20">
          <AppIcon icon={Icon} size={27} color={colors.grey} />
        </View>
        <Text variant="heading" className="text-center">
          {resolvedTitle}
        </Text>
        <Text variant="subhead" color="tertiary" className="mt-1 text-center">
          {error}
        </Text>
        {detail ? (
          <Text
            className="mt-2 text-center text-xs text-muted-foreground"
            numberOfLines={3}
          >
            {detail}
          </Text>
        ) : null}
        {onRetry && (
          <Button
            className="mt-6"
            variant={Platform.OS === "android" ? "plain" : "tonal"}
            size={Platform.OS === "android" ? "sm" : "md"}
            onPress={onRetry}
          >
            <Text>{t("offline_state.try_again")}</Text>
          </Button>
        )}
        {secondaryLabel && onSecondary && (
          <Button
            className="mt-2"
            variant="plain"
            size="sm"
            onPress={onSecondary}
          >
            <Text className="text-primary">{secondaryLabel}</Text>
          </Button>
        )}
      </View>
    </View>
  );
}
