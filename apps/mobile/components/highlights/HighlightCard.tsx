import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { AppIcon } from "@/components/ui/AppIcon";
import { Text } from "@/components/ui/Text";
import { getBookmarkDisplayTitle } from "@/lib/bookmarkDisplay";
import { getIntlLocale } from "@/lib/i18n";
import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import { useQuery } from "@tanstack/react-query";
import { Ellipsis, MessageSquareText } from "lucide-react-native";
import { Platform } from "react-native";

import type { ZHighlight } from "@karakeep/shared/types/highlights";
import { useDeleteHighlight } from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";

import { useToast } from "../ui/Toast";

const HIGHLIGHT_BAR_COLORS = {
  red: "#f87171",
  green: "#4ade80",
  blue: "#60a5fa",
  yellow: "#facc15",
} as const;

export default function HighlightCard({
  highlight,
}: {
  highlight: ZHighlight;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const strings = useCommonStrings();
  const router = useRouter();
  const api = useTRPC();
  const { colors } = useColorScheme();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();

  const { mutate: deleteHighlight, isPending: isDeleting } = useDeleteHighlight(
    {
      onSuccess: () => {
        toast({ message: t("highlights.deleted_toast"), showProgress: false });
      },
      onError: () => {
        toast({
          message: strings.somethingWentWrong,
          variant: "destructive",
          showProgress: false,
        });
      },
    },
  );

  const confirmDelete = () =>
    Alert.alert(
      t("highlights.delete_title"),
      t("highlights.delete_article_unaffected"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("bookmark_actions.delete"),
          onPress: () => deleteHighlight({ highlightId: highlight.id }),
          style: "destructive",
        },
      ],
    );

  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId: highlight.bookmarkId },
      { retry: false },
    ),
  );

  const openInContext = () => {
    void Haptics.selectionAsync();
    router.push(
      `/dashboard/bookmarks/${highlight.bookmarkId}?highlightId=${highlight.id}`,
    );
  };

  return (
    <View
      className="overflow-hidden rounded-xl bg-card"
      style={{ borderCurve: "continuous" }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t("highlights.open_in_article_hint")}
        onPress={openInContext}
        className="gap-2.5 p-3 pb-10 active:opacity-80"
      >
        <View className="flex-row gap-2.5">
          <View
            className="w-[3px] rounded-full"
            style={{ backgroundColor: HIGHLIGHT_BAR_COLORS[highlight.color] }}
          />
          <Text variant="subhead" className="flex-1">
            {highlight.text?.trim() || t("highlights.no_text")}
          </Text>
        </View>

        {highlight.note && (
          <View className="flex-row items-start gap-1.5">
            <View style={{ marginTop: 3 }}>
              <AppIcon icon={MessageSquareText} size={14} color={colors.grey} />
            </View>
            <Text variant="footnote" color="tertiary" className="flex-1">
              {highlight.note}
            </Text>
          </View>
        )}

        <View className="absolute bottom-3 left-3 right-10 flex-row items-center gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-1">
            {bookmark && (
              <>
                <Text
                  variant="caption1"
                  color="tertiary"
                  className="shrink"
                  numberOfLines={1}
                >
                  {getBookmarkDisplayTitle(bookmark)}
                </Text>
                <Text variant="caption1" color="tertiary">
                  ·
                </Text>
              </>
            )}
            <Text
              variant="caption1"
              color="tertiary"
              className="shrink-0"
              numberOfLines={1}
            >
              {highlight.createdAt.toLocaleDateString(getIntlLocale(), {
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
        </View>
      </Pressable>
      <View className="absolute bottom-3 right-3">
        {isDeleting ? (
          <ActivityIndicator size="small" />
        ) : (
          <MenuView
            shouldOpenOnLongPress={false}
            actions={[
              {
                id: "open",
                title: t("highlights.show_in_article"),
                image: Platform.select({ ios: "doc.text" }),
                imageColor: Platform.select({ ios: menuIconColor }),
              },
              {
                id: "delete",
                title: t("highlights.delete_highlight"),
                attributes: { destructive: true },
                image: Platform.select({ ios: "trash" }),
                imageColor: Platform.select({
                  ios: destructiveMenuIconColor,
                }),
              },
            ]}
            onPressAction={({ nativeEvent }) => {
              if (nativeEvent.event === "open") {
                openInContext();
              } else if (nativeEvent.event === "delete") {
                confirmDelete();
              }
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("highlights.actions_label")}
              hitSlop={10}
            >
              <AppIcon icon={Ellipsis} size={18} color={colors.icon} />
            </Pressable>
          </MenuView>
        )}
      </View>
    </View>
  );
}
