import { Platform, View } from "react-native";
import { MenuAction, MenuView } from "@react-native-menu/menu";
import { MoreHorizontal } from "lucide-react-native";

import useAppSettings from "@/lib/settings";
import { useMenuIconColors } from "@/lib/useMenuIconColors";

function useBookmarkListLayoutMenu(): {
  layoutActions: MenuAction[];
  handleLayoutAction: (event: string) => boolean;
  menuIconColor: string;
} {
  const { settings, setSettings } = useAppSettings();
  const { menuIconColor } = useMenuIconColors();

  const layoutActions: MenuAction[] = [
    {
      id: "layout",
      title: "Layout",
      image: Platform.select({ ios: "rectangle.grid.1x2" }),
      imageColor: Platform.select({ ios: menuIconColor }),
      subactions: [
        {
          id: "card",
          title: "Card",
          state: settings.bookmarkLayout === "card" ? "on" : "off",
          image: Platform.select({ ios: "rectangle.grid.1x2" }),
          imageColor: Platform.select({ ios: menuIconColor }),
        },
        {
          id: "list",
          title: "List",
          state: settings.bookmarkLayout === "list" ? "on" : "off",
          image: Platform.select({ ios: "list.bullet" }),
          imageColor: Platform.select({ ios: menuIconColor }),
        },
      ],
    },
    {
      id: "sort",
      title: "Sort",
      image: Platform.select({ ios: "arrow.up.arrow.down" }),
      imageColor: Platform.select({ ios: menuIconColor }),
      subactions: [
        {
          id: "sort_desc",
          title: "Newest First",
          state: settings.bookmarkSortOrder === "desc" ? "on" : "off",
          image: Platform.select({ ios: "arrow.down" }),
          imageColor: Platform.select({ ios: menuIconColor }),
        },
        {
          id: "sort_asc",
          title: "Oldest First",
          state: settings.bookmarkSortOrder === "asc" ? "on" : "off",
          image: Platform.select({ ios: "arrow.up" }),
          imageColor: Platform.select({ ios: menuIconColor }),
        },
      ],
    },
  ];

  const handleLayoutAction = (event: string) => {
    if (event === "card" || event === "list") {
      setSettings({
        ...settings,
        bookmarkLayout: event,
      });
      return true;
    }

    if (event === "sort_desc" || event === "sort_asc") {
      setSettings({
        ...settings,
        bookmarkSortOrder: event === "sort_desc" ? "desc" : "asc",
      });
      return true;
    }

    return false;
  };

  return { layoutActions, handleLayoutAction, menuIconColor };
}

export default function BookmarkListHeader() {
  const { layoutActions, handleLayoutAction, menuIconColor } =
    useBookmarkListLayoutMenu();

  return (
    <MenuView
      onPressAction={({ nativeEvent }) => {
        handleLayoutAction(nativeEvent.event);
      }}
      actions={layoutActions}
      shouldOpenOnLongPress={false}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-card">
        <MoreHorizontal size={20} color={menuIconColor} />
      </View>
    </MenuView>
  );
}

export { useBookmarkListLayoutMenu };
