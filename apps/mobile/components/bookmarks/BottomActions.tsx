import type { ToolbarActionId } from "@/lib/settings";
import type { LucideIcon } from "lucide-react-native";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { AppIcon } from "@/components/ui/AppIcon";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import { showUndoToast, useToast } from "@/components/ui/Toast";
import { useOfflineAvailability } from "@/components/bookmarks/useOfflineAvailability";
import { getBookmarkDisplayTitle } from "@/lib/bookmarkDisplay";
import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";
import type { MobileTFunction } from "@/lib/i18n/hooks";
import { shouldUseGlassPill } from "@/lib/ios";
import useAppSettings from "@/lib/settings";
import { inlineMenuGroup } from "@/lib/menuGroups";
import { shareBookmark } from "@/lib/shareBookmark";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuAction, MenuView } from "@react-native-menu/menu";
import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  List as ListIcon,
  Ellipsis,
  Globe,
  Pencil,
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

const TOOLBAR_HIT_SLOP = { top: 8, bottom: 8 };
// Past this the row wouldn't fit a small phone with labels, so icons go alone.
const MAX_LABELED_TOOLBAR_ITEMS = 6;
// iPads (and wide split views) get a bigger toolbar, labeled whenever the row
// fits the window.
const LARGE_TOOLBAR_MIN_WINDOW_WIDTH = 600;
// Pill padding plus its horizontal margins.
const LARGE_TOOLBAR_CHROME_WIDTH = 64;

const TOOLBAR_SIZES = {
  regular: {
    iconSize: 21,
    itemWidth: 52,
    gap: 2,
    labelClassName: "text-[10px] leading-3",
  },
  large: {
    iconSize: 26,
    itemWidth: 72,
    gap: 6,
    labelClassName: "text-xs leading-4",
  },
};
type ToolbarSize = (typeof TOOLBAR_SIZES)["regular"];

function ToolbarItem({
  icon,
  label,
  showLabel,
  size,
}: {
  icon: React.ReactNode;
  label: string;
  showLabel: boolean;
  size: ToolbarSize;
}) {
  return (
    <View
      className="items-center gap-0.5"
      style={{ width: showLabel ? size.itemWidth : undefined }}
    >
      {icon}
      {showLabel && (
        <Text
          className={`${size.labelClassName} text-foreground`}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

function triggerHaptic() {
  Haptics.selectionAsync().catch(() => {
    // Ignore — haptics unavailable (e.g. simulator)
  });
}

interface ToolbarActionMeta {
  Icon: LucideIcon;
  sfSymbol: string;
}

export const TOOLBAR_ACTION_REGISTRY: Record<
  ToolbarActionId,
  ToolbarActionMeta
> = {
  lists: { Icon: ListIcon, sfSymbol: "list.bullet" },
  tags: { Icon: Tag, sfSymbol: "tag" },
  info: { Icon: Pencil, sfSymbol: "pencil" },
  favourite: { Icon: Star, sfSymbol: "star" },
  archive: { Icon: Archive, sfSymbol: "archivebox" },
  offline: { Icon: ArrowDownToLine, sfSymbol: "arrow.down.circle" },
  browser: { Icon: Globe, sfSymbol: "safari" },
  share: { Icon: ShareIcon, sfSymbol: "square.and.arrow.up" },
  delete: { Icon: Trash2, sfSymbol: "trash" },
};

/** Translated names of the reader toolbar actions, for the toolbar settings. */
export function useToolbarActionLabels(): Record<ToolbarActionId, string> {
  const { t } = useTranslation();
  return {
    lists: t("bookmark_actions.lists"),
    tags: t("bookmark_actions.tags"),
    info: t("bookmark_actions.edit_details"),
    favourite: t("bookmark_actions.favourite"),
    archive: t("bookmark_actions.archive"),
    offline: t("bookmark_actions.download"),
    browser: t("bookmark_actions.open_in_browser"),
    share: t("bookmark_actions.share"),
    delete: t("bookmark_actions.delete"),
  };
}

/** Short enough to sit under the action's icon. */
function toolbarShortLabel(t: MobileTFunction, id: ToolbarActionId): string {
  switch (id) {
    case "lists":
      return t("bookmark_actions.lists");
    case "tags":
      return t("bookmark_actions.tags");
    case "info":
      return t("bookmark_actions.details_short");
    case "favourite":
      return t("bookmark_actions.favourite");
    case "archive":
      return t("bookmark_actions.archive");
    case "offline":
      return t("bookmark_actions.download");
    case "browser":
      return t("bookmark_actions.browser_short");
    case "share":
      return t("bookmark_actions.share");
    case "delete":
      return t("bookmark_actions.delete");
  }
}

/** The action's name for this bookmark, as menus and screen readers say it. */
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
        ? t("bookmark_actions.move_out_of_archive")
        : t("bookmark_actions.archive");
    case "lists":
      return t("bookmark_actions.lists");
    case "tags":
      return t("bookmark_actions.tags");
    case "info":
      return t("bookmark_actions.edit_details");
    case "offline":
      return t("bookmark_actions.download");
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

function useToolbarActions(bookmark: ZBookmark, iconSize: number) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const strings = useCommonStrings();
  const router = useRouter();
  const { settings } = useAppSettings();
  const { data: currentUser } = useWhoAmI();

  const isOwner = currentUser?.id === bookmark.userId;
  const offline = useOfflineAvailability(bookmark.id);

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        router.back();
        toast({
          message: t("bookmarks.bookmark_deleted_toast"),
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

  // Undo only flips the flag back: no navigation and no second undo toast.
  const { mutate: undoArchive } = useUpdateBookmark({
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
        // Taking something out of the archive means you want to keep reading.
        if (resp.archived) {
          router.back();
        }
        showUndoToast(
          resp.archived
            ? t("bookmarks.archived")
            : t("bookmark_actions.moved_out_of_archive"),
          () =>
            undoArchive({
              bookmarkId: bookmark.id,
              archived: !resp.archived,
            }),
        );
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
      t("bookmark_actions.delete_named_title", {
        title: getBookmarkDisplayTitle(bookmark),
      }),
      t("bookmark_actions.delete_permanent_message"),
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
        <AppIcon
          icon={IconComp}
          size={iconSize}
          color={overrideColor ?? styles?.color?.toString() ?? "#000"}
          filled={fill != null}
        />
      )}
    />
  );

  const allActions: Record<ToolbarActionId, ToolbarAction> = {
    lists: {
      id: "lists",
      icon: makeIcon(ListIcon),
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
      icon: makeIcon(Pencil),
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
      // iOS has a solid archive symbol. A filled Lucide outline is just a blob.
      icon:
        bookmark.archived && Platform.OS === "ios"
          ? makeIcon(Archive, undefined, "filled")
          : makeIcon(bookmark.archived ? ArchiveRestore : Archive),
      shouldRender: isOwner,
      onClick: () => {
        archiveBookmark({
          bookmarkId: bookmark.id,
          archived: !bookmark.archived,
        });
      },
      disabled: isArchivePending,
    },
    offline: {
      id: "offline",
      icon: makeIcon(ArrowDownToLine),
      shouldRender:
        bookmark.content.type === BookmarkTypes.LINK ||
        bookmark.content.type === BookmarkTypes.TEXT,
      onClick: () => {
        triggerHaptic();
        if (offline.isAvailableOffline) {
          offline.confirmRemove();
        } else {
          void offline.save();
        }
      },
      disabled: offline.isSaving,
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

  return { barActions, overflowActions, allActions, offline };
}

function ToolbarContainer({
  children,
  bottomMargin,
  bottomInset,
  size,
  large,
}: {
  children: React.ReactNode;
  bottomMargin: number;
  bottomInset: number;
  size: ToolbarSize;
  large: boolean;
}) {
  const innerRow = (
    <View
      style={{
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: size.gap,
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
          borderRadius: large ? 30 : 22,
          marginHorizontal: 16,
          alignSelf: "center",
          marginBottom: bottomMargin,
          paddingVertical: large ? 10 : 8,
          paddingHorizontal: large ? 16 : 12,
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
  const { width: windowWidth } = useWindowDimensions();
  const large = windowWidth >= LARGE_TOOLBAR_MIN_WINDOW_WIDTH;
  const size = large ? TOOLBAR_SIZES.large : TOOLBAR_SIZES.regular;
  const { barActions, overflowActions, allActions, offline } =
    useToolbarActions(bookmark, size.iconSize);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { more } = useCommonActions();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();

  const itemCount = barActions.filter((a) => a.shouldRender).length + 1;
  const showLabels = large
    ? itemCount * (size.itemWidth + size.gap) + LARGE_TOOLBAR_CHROME_WIDTH <=
      windowWidth
    : itemCount <= MAX_LABELED_TOOLBAR_ITEMS;
  const bottomMargin = shouldUseGlassPill ? Math.max(insets.bottom - 8, 4) : 8;

  // Build native menu actions for the overflow ellipsis
  const menuActions: MenuAction[] = overflowActions
    .filter((a) => a.shouldRender)
    .map((a) => {
      const meta = TOOLBAR_ACTION_REGISTRY[a.id];
      return {
        id: a.id,
        title:
          a.id === "offline" && offline.isAvailableOffline
            ? t("bookmark_actions.remove_download")
            : translateToolbarRender(t, a.id, bookmark),
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
  const destructiveActions = menuActions.filter((a) => a.id === "delete");
  const regularActions = menuActions.filter((a) => a.id !== "delete");
  const menuActionsWithEdit: MenuAction[] = [
    ...inlineMenuGroup("overflow-group", regularActions),
    {
      id: "edit-toolbar",
      title: t("bookmark_actions.edit_toolbar_menu"),
      image: Platform.select({
        ios: "slider.horizontal.3",
        default: undefined,
      }),
      imageColor: menuIconColor,
    },
    ...destructiveActions,
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
      <ToolbarContainer
        bottomMargin={bottomMargin}
        bottomInset={insets.bottom}
        size={size}
        large={large}
      >
        {barActions.map(
          (a) =>
            a.shouldRender && (
              <Pressable
                disabled={a.disabled}
                key={a.id}
                onPress={a.onClick}
                // Icons have no room for labels, so press and hold names them.
                onLongPress={() => {
                  triggerHaptic();
                  toast({
                    message: translateToolbarRender(t, a.id, bookmark),
                    showProgress: false,
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={translateToolbarRender(t, a.id, bookmark)}
                hitSlop={TOOLBAR_HIT_SLOP}
                className="py-auto"
              >
                <ToolbarItem
                  icon={a.icon}
                  label={
                    a.id === "archive" && bookmark.archived
                      ? t("bookmark_actions.unarchive_short")
                      : toolbarShortLabel(t, a.id)
                  }
                  showLabel={showLabels}
                  size={size}
                />
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("bookmark_actions.more_actions_label")}
            hitSlop={TOOLBAR_HIT_SLOP}
            onPress={() => triggerHaptic()}
          >
            <ToolbarItem
              icon={
                <TailwindResolver
                  className="text-foreground"
                  comp={(styles) => (
                    <AppIcon
                      icon={Ellipsis}
                      size={size.iconSize}
                      color={styles?.color?.toString() ?? "#000"}
                    />
                  )}
                />
              }
              label={more}
              showLabel={showLabels}
              size={size}
            />
          </Pressable>
        </MenuView>
      </ToolbarContainer>
    </View>
  );
}
