import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import { ChevronDown } from "lucide-react-native";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

export type BookmarkLinkType =
  | "browser"
  | "reader"
  | "screenshot"
  | "archive"
  | "pdf";

function getAvailableViewTypes(bookmark: ZBookmark): BookmarkLinkType[] {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return [];
  }

  const availableTypes: BookmarkLinkType[] = ["browser", "reader"];

  if (bookmark.assets.some((asset) => asset.assetType === "screenshot")) {
    availableTypes.push("screenshot");
  }

  if (
    bookmark.assets.some(
      (asset) =>
        asset.assetType === "precrawledArchive" ||
        asset.assetType === "fullPageArchive",
    )
  ) {
    availableTypes.push("archive");
  }
  if (bookmark.assets.some((asset) => asset.assetType === "pdf")) {
    availableTypes.push("pdf");
  }

  return availableTypes;
}

interface BookmarkLinkTypeSelectorProps {
  type: BookmarkLinkType;
  onChange: (type: BookmarkLinkType) => void;
  bookmark: ZBookmark;
}

export default function BookmarkLinkTypeSelector({
  type,
  onChange,
  bookmark,
}: BookmarkLinkTypeSelectorProps) {
  const availableTypes = getAvailableViewTypes(bookmark);
  const { menuIconColor } = useMenuIconColors();

  const viewActions = [
    {
      id: "reader" as const,
      title: "Reader View",
      state: type === "reader" ? ("on" as const) : undefined,
      image: Platform.select({
        ios: "doc.text",
      }),
      imageColor: Platform.select({
        ios: menuIconColor,
      }),
    },
    {
      id: "browser" as const,
      title: "Browser",
      state: type === "browser" ? ("on" as const) : undefined,
      image: Platform.select({
        ios: "safari",
      }),
      imageColor: Platform.select({
        ios: menuIconColor,
      }),
    },
    {
      id: "screenshot" as const,
      title: "Screenshot",
      state: type === "screenshot" ? ("on" as const) : undefined,
      image: Platform.select({
        ios: "camera",
      }),
      imageColor: Platform.select({
        ios: menuIconColor,
      }),
    },
    {
      id: "archive" as const,
      title: "Archived Page",
      state: type === "archive" ? ("on" as const) : undefined,
      image: Platform.select({
        ios: "tray.full",
      }),
      imageColor: Platform.select({
        ios: menuIconColor,
      }),
    },
    {
      id: "pdf" as const,
      title: "PDF",
      state: type === "pdf" ? ("on" as const) : undefined,
      image: Platform.select({
        ios: "doc",
      }),
      imageColor: Platform.select({
        ios: menuIconColor,
      }),
    },
  ];

  const availableViewActions = viewActions.filter((action) =>
    availableTypes.includes(action.id),
  );

  return (
    <MenuView
      onPressAction={({ nativeEvent }) => {
        Haptics.selectionAsync();
        onChange(nativeEvent.event as BookmarkLinkType);
      }}
      actions={availableViewActions}
      shouldOpenOnLongPress={false}
    >
      <ChevronDown onPress={() => Haptics.selectionAsync()} color="gray" />
    </MenuView>
  );
}
