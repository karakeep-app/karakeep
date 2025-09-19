import * as Haptics from "expo-haptics";
import { MenuView } from "@react-native-menu/menu";
import { ChevronDown } from "lucide-react-native";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

export type BookmarkLinkType = "browser" | "reader" | "screenshot" | "archive";

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

  const allActions = [
    {
      id: "reader" as const,
      title: "Reader View",
      state: type === "reader" ? ("on" as const) : undefined,
    },
    {
      id: "browser" as const,
      title: "Browser",
      state: type === "browser" ? ("on" as const) : undefined,
    },
    {
      id: "screenshot" as const,
      title: "Screenshot",
      state: type === "screenshot" ? ("on" as const) : undefined,
    },
    {
      id: "archive" as const,
      title: "Archived Page",
      state: type === "archive" ? ("on" as const) : undefined,
    },
  ];

  const availableActions = allActions.filter((action) =>
    availableTypes.includes(action.id),
  );

  return (
    <MenuView
      onPressAction={({ nativeEvent }) => {
        Haptics.selectionAsync();
        onChange(nativeEvent.event as BookmarkLinkType);
      }}
      actions={availableActions}
      shouldOpenOnLongPress={false}
    >
      <ChevronDown onPress={() => Haptics.selectionAsync()} color="gray" />
    </MenuView>
  );
}
