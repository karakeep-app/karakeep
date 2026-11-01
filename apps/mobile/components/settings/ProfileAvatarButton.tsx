import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ConnectionStatusIndicator } from "@/components/ConnectionStatusIndicator";
import { Avatar } from "@/components/ui/Avatar";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { useTranslation } from "@/lib/i18n/hooks";

const AVATAR_SIZE = 28;
const HIT_TARGET = 44;

export function ProfileAvatarButton() {
  const router = useRouter();
  const { t } = useTranslation();
  const api = useTRPC();
  const { data } = useQuery(api.users.whoami.queryOptions());

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        router.push("/dashboard/settings");
      }}
      hitSlop={(HIT_TARGET - AVATAR_SIZE) / 2}
      accessibilityLabel={t("profile.open_settings")}
      accessibilityRole="button"
      className="relative"
    >
      <Avatar image={data?.image} name={data?.name} size={AVATAR_SIZE} />
      <ConnectionStatusIndicator />
    </Pressable>
  );
}
