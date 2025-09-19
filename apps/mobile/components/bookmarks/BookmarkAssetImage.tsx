import { Image } from "react-native";
import { useAssetUrl } from "@/lib/hooks";

export default function BookmarkAssetImage({
  assetId,
  className,
}: {
  assetId: string;
  className: string;
}) {
  const assetSource = useAssetUrl(assetId);

  return <Image source={assetSource} className={className} />;
}
