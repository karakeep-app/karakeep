import * as React from "react";
import { Image, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface AvatarProps {
  image?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

function isExternalUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function Avatar({
  image,
  name,
  size = 40,
  className,
  imageClassName,
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

  return (
    <View
      className={cn("overflow-hidden bg-black", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
      }}
    >
      {showFallback ? (
        <View
          className={cn(
            "flex h-full w-full items-center justify-center bg-black",
            fallbackClassName,
          )}
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
          className={cn("h-full w-full", imageClassName)}
          style={{ resizeMode: "cover" }}
          onError={() => setImageError(true)}
        />
      )}
    </View>
  );
}
