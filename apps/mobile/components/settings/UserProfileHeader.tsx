import { View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";

interface UserProfileHeaderProps {
  image?: string | null;
  name?: string | null;
  email?: string | null;
}

export function UserProfileHeader({
  image,
  name,
  email,
}: UserProfileHeaderProps) {
  return (
    <View className="w-full items-center gap-2 py-6">
      <Avatar image={image} name={name} size={88} />
      <View className="items-center gap-1">
        <Text className="text-xl font-semibold">{name || "User"}</Text>
        {email && (
          <Text className="text-sm text-muted-foreground">{email}</Text>
        )}
      </View>
    </View>
  );
}
