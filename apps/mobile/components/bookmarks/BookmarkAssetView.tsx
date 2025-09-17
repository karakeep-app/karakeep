import { useState } from "react";
import { Pressable, View } from "react-native";
import ImageView from "react-native-image-viewing";
import BookmarkAssetImage from "@/components/bookmarks/BookmarkAssetImage";
import { PDFViewer } from "@/components/bookmarks/PDFViewer";
import { useAssetUrl } from "@/lib/hooks";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

interface BookmarkAssetViewProps {
  bookmark: ZBookmark;
}

export default function BookmarkAssetView({
  bookmark,
}: BookmarkAssetViewProps) {
  const [imageZoom, setImageZoom] = useState(false);

  if (bookmark.content.type !== BookmarkTypes.ASSET) {
    throw new Error("Wrong content type rendered");
  }

  const assetSource = useAssetUrl(bookmark.content.assetId);

  // Check if this is a PDF asset
  if (bookmark.content.assetType === "pdf") {
    return (
      <View className="flex flex-1">
        <PDFViewer
          source={assetSource.uri ?? ""}
          headers={assetSource.headers}
        />
      </View>
    );
  }

  // Handle image assets as before
  return (
    <View className="flex flex-1 gap-2">
      <ImageView
        visible={imageZoom}
        imageIndex={0}
        onRequestClose={() => setImageZoom(false)}
        doubleTapToZoomEnabled={true}
        images={[assetSource]}
      />

      <Pressable onPress={() => setImageZoom(true)}>
        <BookmarkAssetImage
          assetId={bookmark.content.assetId}
          className="h-56 min-h-56 w-full object-cover"
        />
      </Pressable>
    </View>
  );
}
