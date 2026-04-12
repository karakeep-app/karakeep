import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

const AVATAR_SIZE = 28;
const CONTAINER_SIZE = 44;

export function ProfileAvatarButton() {
  const router = useRouter();
  const api = useTRPC();
  const { data } = useQuery(api.users.whoami.queryOptions());

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        router.push("/dashboard/settings");
      }}
      accessibilityLabel="Open profile settings"
      accessibilityRole="button"
    >
      <View
        className="items-center justify-center rounded-full"
        style={{ width: CONTAINER_SIZE, height: CONTAINER_SIZE }}
      >
        <Avatar image={data?.image} name={data?.name} size={AVATAR_SIZE} />
      </View>
    </Pressable>
  );
}
