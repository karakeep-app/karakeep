import { View } from "react-native";
import { useTranslation } from "@/lib/i18n/hooks";
import { Text } from "@/components/ui/Text";

export default function ErrorPage() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text variant="largeTitle">{t("app.error_title")}</Text>
    </View>
  );
}
