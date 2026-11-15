import { View } from "react-native";
import { Image, ImageContentFit, ImageContentPosition } from "expo-image";
import { useAssetUrl } from "@/lib/hooks";

export default function BookmarkAssetImage({
  assetId,
  className,
  contentFit = "cover",
  contentPosition,
}: {
  assetId: string;
  className: string;
  contentFit?: ImageContentFit;
  contentPosition?: ImageContentPosition;
}) {
  const assetSource = useAssetUrl(assetId);

  return (
    <View className={className}>
      <Image
        source={assetSource}
        style={{ width: "100%", height: "100%" }}
        contentFit={contentFit}
        contentPosition={contentPosition}
      />
    </View>
  );
}
