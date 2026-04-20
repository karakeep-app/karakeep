import { View } from "react-native";
import { Image, ImageContentFit } from "expo-image";
import { useAssetUrl } from "@/lib/hooks";

export default function BookmarkAssetImage({
  assetId,
  className,
  contentFit = "cover",
}: {
  assetId: string;
  className: string;
  contentFit?: ImageContentFit;
}) {
  const assetSource = useAssetUrl(assetId);

  return (
    <View className={className}>
      <Image
        source={assetSource}
        style={{ width: "100%", height: "100%" }}
        contentFit={contentFit}
      />
    </View>
  );
}
