import * as React from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface AvatarProps {
  image?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  fallbackClassName?: string;
}

const AVATAR_COLORS = [
  "#f87171", // red-400
  "#fb923c", // orange-400
  "#fbbf24", // amber-400
  "#a3e635", // lime-400
  "#34d399", // emerald-400
  "#22d3ee", // cyan-400
  "#60a5fa", // blue-400
  "#818cf8", // indigo-400
  "#a78bfa", // violet-400
  "#e879f9", // fuchsia-400
];

function nameToColor(name: string | null | undefined): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function isExternalUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function Avatar({
  image,
  name,
  size = 40,
  className,
  fallbackClassName,
}: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);
  const assetUrl = useAssetUrl(image ?? "");

  const imageUrl = React.useMemo(() => {
    if (!image) return null;
    return isExternalUrl(image)
      ? {
          uri: image,
        }
      : assetUrl;
  }, [image]);

  React.useEffect(() => {
    setImageError(false);
  }, [image]);

  const initials = React.useMemo(() => {
    if (!name) return "U";
    return name.charAt(0).toUpperCase();
  }, [name]);

  const showFallback = !imageUrl || imageError;
  const avatarColor = nameToColor(name);

  return (
    <View
      className={cn("overflow-hidden", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: showFallback ? avatarColor : undefined,
      }}
    >
      {showFallback ? (
        <View
          className={cn(
            "flex h-full w-full items-center justify-center",
            fallbackClassName,
          )}
          style={{ backgroundColor: avatarColor }}
        >
          <Text
            className="text-white"
            style={{
              fontSize: size * 0.4,
              lineHeight: size * 0.4,
              textAlign: "center",
            }}
          >
            {initials}
          </Text>
        </View>
      ) : (
        <Image
          source={imageUrl}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          onError={() => setImageError(true)}
        />
      )}
    </View>
  );
}
