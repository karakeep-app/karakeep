import { View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { useTranslation } from "@/lib/i18n/hooks";
import { Text } from "@/components/ui/Text";

interface UserProfileHeaderProps {
  image?: string | null;
  name?: string | null;
  email?: string | null;
}

/** A compact account row, so settings themselves start on the first screen. */
export function UserProfileHeader({
  image,
  name,
  email,
}: UserProfileHeaderProps) {
  const { t } = useTranslation();
  return (
    <View
      className="flex-row items-center gap-3 rounded-xl bg-card px-4 py-3"
      style={{ borderCurve: "continuous" }}
    >
      <Avatar image={image} name={name} size={44} />
      <View className="min-w-0 flex-1">
        <Text variant="heading" numberOfLines={1}>
          {name ?? t("profile.your_account")}
        </Text>
        {email ? (
          <Text variant="footnote" color="tertiary" numberOfLines={1}>
            {email}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
