import type { ToolbarActionId } from "@/lib/settings";
import type { LucideIcon } from "lucide-react-native";
import { Alert, Linking, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { TailwindResolver } from "@/components/TailwindResolver";
import { useToast } from "@/components/ui/Toast";
import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";
import type { MobileTFunction } from "@/lib/i18n/hooks";
import { shouldUseGlassPill } from "@/lib/ios";
import useAppSettings from "@/lib/settings";
import { shareBookmark } from "@/lib/shareBookmark";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuAction, MenuView } from "@react-native-menu/menu";
import {
  Archive,
  ClipboardList,
  Ellipsis,
  Globe,
  Info,
  ShareIcon,
  Star,
  Tag,
  Trash2,
} from "lucide-react-native";

import {
  useDeleteBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

const TOOLBAR_ICON_GAP = 28;

function triggerHaptic() {
  Haptics.selectionAsync().catch(() => {
    // Ignore — haptics unavailable (e.g. simulator)
  });
}

interface ToolbarActionMeta {
  label: string;
  render: (b: ZBookmark) => string;
  Icon: LucideIcon;
  sfSymbol: string;
}

export const TOOLBAR_ACTION_REGISTRY: Record<
  ToolbarActionId,
  ToolbarActionMeta & { labelKey: string }
> = {
  lists: {
    label: "Lists",
    labelKey: "bookmark_actions.lists",
    render: () => "Lists",
    Icon: ClipboardList,
    sfSymbol: "list.bullet",
  },
  tags: {
    label: "Tags",
    labelKey: "bookmark_actions.tags",
    render: () => "Tags",
    Icon: Tag,
    sfSymbol: "tag",
  },
  info: {
    label: "Info",
    labelKey: "bookmark_actions.info",
    render: () => "Info",
    Icon: Info,
    sfSymbol: "info.circle",
  },
  favourite: {
    label: "Favourite",
    labelKey: "bookmark_actions.favourite",
    render: (b) => (b.favourited ? "Unfavourite" : "Favourite"),
    Icon: Star,
    sfSymbol: "star",
  },
  archive: {
    label: "Archive",
    labelKey: "bookmark_actions.archive",
    render: (b) => (b.archived ? "Un-archive" : "Archive"),
    Icon: Archive,
    sfSymbol: "archivebox",
  },
  browser: {
    label: "Open in Browser",
    labelKey: "bookmark_actions.open_in_browser",
    render: () => "Open in Browser",
    Icon: Globe,
    sfSymbol: "safari",
  },
  share: {
    label: "Share",
    labelKey: "bookmark_actions.share",
    render: () => "Share",
    Icon: ShareIcon,
    sfSymbol: "square.and.arrow.up",
  },
  delete: {
    label: "Delete",
    labelKey: "bookmark_actions.delete",
    render: () => "Delete",
    Icon: Trash2,
    sfSymbol: "trash",
  },
};

/**
 * Translated labels for the reader toolbar actions. The static
 * `TOOLBAR_ACTION_REGISTRY` keeps English fallbacks (used before i18n init
 * and by the toolbar-settings screen when rendered outside a rerender);
 * prefer this hook for anything user-visible.
 */
export function useToolbarActionLabels(): Record<ToolbarActionId, string> {
  const { t } = useTranslation();
  return {
    lists: t("bookmark_actions.lists"),
    tags: t("bookmark_actions.tags"),
    info: t("bookmark_actions.info"),
    favourite: t("bookmark_actions.favourite"),
    archive: t("bookmark_actions.archive"),
    browser: t("bookmark_actions.open_in_browser"),
    share: t("bookmark_actions.share"),
    delete: t("bookmark_actions.delete"),
  };
}

export function translateToolbarRender(
  t: MobileTFunction,
  id: ToolbarActionId,
  bookmark: ZBookmark,
): string {
  switch (id) {
    case "favourite":
      return bookmark.favourited
        ? t("bookmark_actions.unfavourite")
        : t("bookmark_actions.favourite");
    case "archive":
      return bookmark.archived
        ? t("bookmark_actions.unarchive")
        : t("bookmark_actions.archive");
    case "lists":
      return t("bookmark_actions.lists");
    case "tags":
      return t("bookmark_actions.tags");
    case "info":
      return t("bookmark_actions.info");
    case "browser":
      return t("bookmark_actions.open_in_browser");
    case "share":
      return t("bookmark_actions.share");
    case "delete":
      return t("bookmark_actions.delete");
  }
}

interface ToolbarAction {
  id: ToolbarActionId;
  icon: React.ReactNode;
  shouldRender: boolean;
  onClick: () => void;
  disabled: boolean;
}

function useToolbarActions(bookmark: ZBookmark) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const strings = useCommonStrings();
  const router = useRouter();
  const { settings } = useAppSettings();
  const { data: currentUser } = useWhoAmI();

  const isOwner = currentUser?.id === bookmark.userId;

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        router.back();
        toast({
          message: t("bookmark_actions.deleted"),
          showProgress: false,
        });
      },
      onError: () => {
        toast({
          message: strings.somethingWentWrong,
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const { mutate: favouriteBookmark, isPending: isFavouritePending } =
    useUpdateBookmark({
      onError: () => {
        toast({
          message: strings.somethingWentWrong,
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const { mutate: archiveBookmark, isPending: isArchivePending } =
    useUpdateBookmark({
      onSuccess: (resp) => {
        router.back();
        toast({
          message: resp.archived
            ? t("bookmark_actions.archived_message")
            : t("bookmark_actions.unarchived_message"),
          showProgress: false,
        });
      },
      onError: () => {
        toast({
          message: strings.somethingWentWrong,
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const deleteBookmarkAlert = () =>
    Alert.alert(
      t("bookmark_actions.delete_title"),
      t("bookmark_actions.delete_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("bookmark_actions.delete"),
          onPress: () => deleteBookmark({ bookmarkId: bookmark.id }),
          style: "destructive",
        },
      ],
    );

  const handleShare = () => shareBookmark(bookmark, settings, toast);

  const makeIcon = (
    IconComp: LucideIcon,
    overrideColor?: string,
    fill?: string,
  ) => (
    <TailwindResolver
      className="text-foreground"
      comp={(styles) => (
        <IconComp
          size={22}
          color={overrideColor ?? styles?.color?.toString()}
          {...(fill != null && { fill })}
        />
      )}
    />
  );

  const allActions: Record<ToolbarActionId, ToolbarAction> = {
    lists: {
      id: "lists",
      icon: makeIcon(ClipboardList),
      shouldRender: isOwner,
      onClick: () =>
        router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`),
      disabled: false,
    },
    tags: {
      id: "tags",
      icon: makeIcon(Tag),
      shouldRender: isOwner,
      onClick: () =>
        router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`),
      disabled: false,
    },
    info: {
      id: "info",
      icon: makeIcon(Info),
      shouldRender: true,
      onClick: () => router.push(`/dashboard/bookmarks/${bookmark.id}/info`),
      disabled: false,
    },
    favourite: {
      id: "favourite",
      icon: bookmark.favourited
        ? makeIcon(Star, "#ebb434", "#ebb434")
        : makeIcon(Star),
      shouldRender: isOwner,
      onClick: () => {
        triggerHaptic();
        favouriteBookmark({
          bookmarkId: bookmark.id,
          favourited: !bookmark.favourited,
        });
      },
      disabled: isFavouritePending,
    },
    archive: {
      id: "archive",
      icon: makeIcon(Archive),
      shouldRender: isOwner,
      onClick: () => {
        archiveBookmark({
          bookmarkId: bookmark.id,
          archived: !bookmark.archived,
        });
      },
      disabled: isArchivePending,
    },
    browser: {
      id: "browser",
      icon: makeIcon(Globe),
      shouldRender: bookmark.content.type === BookmarkTypes.LINK,
      onClick: () => {
        if (bookmark.content.type !== BookmarkTypes.LINK) return;
        Linking.openURL(bookmark.content.url).catch(() => {
          toast({
            message: t("bookmarks.failed_open_link"),
            variant: "destructive",
            showProgress: false,
          });
        });
      },
      disabled: false,
    },
    share: {
      id: "share",
      icon: makeIcon(ShareIcon),
      shouldRender: true,
      onClick: () => {
        triggerHaptic();
        handleShare();
      },
      disabled: false,
    },
    delete: {
      id: "delete",
      icon: makeIcon(Trash2),
      shouldRender: isOwner,
      onClick: deleteBookmarkAlert,
      disabled: isDeletionPending,
    },
  };

  const barActions = settings.toolbarActions
    .map((id) => allActions[id])
    .filter((a): a is ToolbarAction => a !== undefined);

  const overflowActions = (settings.overflowActions ?? [])
    .map((id) => allActions[id])
    .filter((a): a is ToolbarAction => a !== undefined);

  return { barActions, overflowActions, allActions };
}

function ToolbarContainer({
  children,
  bottomMargin,
  bottomInset,
}: {
  children: React.ReactNode;
  bottomMargin: number;
  bottomInset: number;
}) {
  const innerRow = (
    <View
      style={{
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: TOOLBAR_ICON_GAP,
      }}
    >
      {children}
    </View>
  );

  if (shouldUseGlassPill) {
    return (
      <GlassView
        glassEffectStyle="regular"
        style={{
          borderRadius: 22,
          marginHorizontal: 16,
          alignSelf: "center",
          marginBottom: bottomMargin,
          paddingVertical: 10,
          paddingHorizontal: 20,
        }}
      >
        {innerRow}
      </GlassView>
    );
  }

  const fallbackStyle = {
    paddingHorizontal: 40,
    paddingTop: 16,
    paddingBottom: bottomInset + 16,
  };

  if (Platform.OS === "ios") {
    return (
      <BlurView tint="systemMaterial" intensity={80} style={fallbackStyle}>
        {innerRow}
      </BlurView>
    );
  }

  return (
    <View className="bg-background" style={fallbackStyle}>
      {innerRow}
    </View>
  );
}

interface BottomActionsProps {
  bookmark: ZBookmark;
}

export default function BottomActions({ bookmark }: BottomActionsProps) {
  const { barActions, overflowActions, allActions } =
    useToolbarActions(bookmark);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();

  const bottomMargin = shouldUseGlassPill ? Math.max(insets.bottom - 8, 4) : 8;

  // Build native menu actions for the overflow ellipsis
  const menuActions: MenuAction[] = overflowActions
    .filter((a) => a.shouldRender)
    .map((a) => {
      const meta = TOOLBAR_ACTION_REGISTRY[a.id];
      return {
        id: a.id,
        title: translateToolbarRender(t, a.id, bookmark),
        image: Platform.select({ ios: meta.sfSymbol, default: undefined }),
        imageColor:
          a.id === "delete" ? destructiveMenuIconColor : menuIconColor,
        attributes: {
          ...(a.id === "delete" && { destructive: true as const }),
          ...(a.disabled && { disabled: true as const }),
        },
      };
    });

  // Add separator + "Edit Toolbar..." at the bottom
  const menuActionsWithEdit: MenuAction[] = [
    ...(menuActions.length > 0
      ? [
          {
            id: "overflow-group",
            // DisplayInline doesn't seem to be working on android
            title:
              Platform.OS === "ios" ? "" : t("bookmark_actions.more_actions"),
            displayInline: true as const,
            subactions: menuActions,
          },
        ]
      : []),
    {
      id: "edit-toolbar",
      title: t("bookmark_actions.edit_toolbar"),
      image: Platform.select({
        ios: "slider.horizontal.3",
        default: undefined,
      }),
      imageColor: menuIconColor,
    },
  ];

  const handleMenuAction = (event: string) => {
    if (event === "edit-toolbar") {
      router.push("/dashboard/settings/toolbar-settings");
      return;
    }
    const action = allActions[event as ToolbarActionId];
    if (action) {
      action.onClick();
    } else {
      console.warn(`Unknown menu action: "${event}"`);
    }
  };

  return (
    <View>
      <ToolbarContainer bottomMargin={bottomMargin} bottomInset={insets.bottom}>
        {barActions.map(
          (a) =>
            a.shouldRender && (
              <Pressable
                disabled={a.disabled}
                key={a.id}
                onPress={a.onClick}
                className="py-auto"
              >
                {a.icon}
              </Pressable>
            ),
        )}
        <MenuView
          onPressAction={({ nativeEvent }) => {
            triggerHaptic();
            handleMenuAction(nativeEvent.event);
          }}
          actions={menuActionsWithEdit}
          shouldOpenOnLongPress={false}
        >
          <Pressable onPress={() => triggerHaptic()}>
            <TailwindResolver
              className="text-foreground"
              comp={(styles) => (
                <Ellipsis size={22} color={styles?.color?.toString()} />
              )}
            />
          </Pressable>
        </MenuView>
      </ToolbarContainer>
    </View>
  );
}
