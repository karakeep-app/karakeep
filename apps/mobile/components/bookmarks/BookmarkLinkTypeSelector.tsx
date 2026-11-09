import { Platform, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
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
  const { t } = useTranslation();
  const { menuIconColor } = useMenuIconColors();
  const { colors } = useColorScheme();
  const viewLabels: Record<BookmarkLinkType, string> = {
    browser: t("bookmarks.view_browser"),
    reader: t("bookmarks.view_reader_short"),
    screenshot: t("bookmarks.view_screenshot"),
    archive: t("bookmarks.view_archive"),
    pdf: t("bookmarks.view_pdf"),
  };

  const viewActions = [
    {
      id: "reader" as const,
      title: t("bookmarks.view_reader_short"),
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
      title: t("bookmarks.view_browser"),
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
      title: t("bookmarks.view_screenshot"),
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
      title: t("bookmarks.view_archived_page"),
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
      title: t("bookmarks.view_pdf"),
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("bookmarks.view_selector_label", {
          view: viewLabels[type],
        })}
        className="flex-row items-center gap-0.5"
        hitSlop={8}
        onPress={() => void Haptics.selectionAsync()}
      >
        <Text variant="subhead" className="font-medium">
          {viewLabels[type]}
        </Text>
        <ChevronDown size={16} color={colors.grey} strokeWidth={2.4} />
      </Pressable>
    </MenuView>
  );
}
