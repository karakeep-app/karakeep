import type { ToolbarActionId } from "@/lib/settings";
import type { LucideIcon } from "lucide-react-native";
import { Alert, Linking, Platform, Pressable, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { TailwindResolver } from "@/components/TailwindResolver";
import { useToast } from "@/components/ui/Toast";
import { isIOS26 } from "@/lib/ios";
import useAppSettings from "@/lib/settings";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { buildApiHeaders } from "@/lib/utils";
import { MenuView } from "@react-native-menu/menu";
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

function triggerHaptic() {
  Haptics.selectionAsync().catch(() => {
    // Ignore — haptics unavailable (e.g. simulator)
  });
}

interface ToolbarActionMeta {
  label: string;
  Icon: LucideIcon;
  sfSymbol: string;
}

export const TOOLBAR_ACTION_REGISTRY: Record<
  ToolbarActionId,
  ToolbarActionMeta
> = {
  lists: { label: "Lists", Icon: ClipboardList, sfSymbol: "list.bullet" },
  tags: { label: "Tags", Icon: Tag, sfSymbol: "tag" },
  info: { label: "Info", Icon: Info, sfSymbol: "info.circle" },
  favourite: { label: "Favourite", Icon: Star, sfSymbol: "star" },
  archive: { label: "Archive", Icon: Archive, sfSymbol: "archivebox" },
  browser: { label: "Open in Browser", Icon: Globe, sfSymbol: "safari" },
  share: { label: "Share", Icon: ShareIcon, sfSymbol: "square.and.arrow.up" },
  delete: { label: "Delete", Icon: Trash2, sfSymbol: "trash" },
};

interface ToolbarAction {
  id: ToolbarActionId;
  icon: React.ReactNode;
  shouldRender: boolean;
  onClick: () => void;
  disabled: boolean;
}

function useToolbarActions(bookmark: ZBookmark) {
  const { toast } = useToast();
  const router = useRouter();
  const { settings } = useAppSettings();
  const { data: currentUser } = useWhoAmI();

  const isOwner = currentUser?.id === bookmark.userId;

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        router.back();
        toast({
          message: "The bookmark has been deleted!",
          showProgress: false,
        });
      },
      onError: () => {
        toast({
          message: "Something went wrong",
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const { mutate: favouriteBookmark, variables: favouriteVars } =
    useUpdateBookmark({
      onError: () => {
        toast({
          message: "Something went wrong",
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const { mutate: archiveBookmark, isPending: isArchivePending } =
    useUpdateBookmark({
      onSuccess: (resp) => {
        toast({
          message: `The bookmark has been ${resp.archived ? "archived" : "un-archived"}!`,
          showProgress: false,
        });
      },
      onError: () => {
        toast({
          message: "Something went wrong",
          variant: "destructive",
          showProgress: false,
        });
      },
    });

  const deleteBookmarkAlert = () =>
    Alert.alert(
      "Delete bookmark?",
      "Are you sure you want to delete this bookmark?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: () => deleteBookmark({ bookmarkId: bookmark.id }),
          style: "destructive",
        },
      ],
    );

  const handleShare = async () => {
    try {
      switch (bookmark.content.type) {
        case BookmarkTypes.LINK:
          await Share.share({
            url: bookmark.content.url,
            message: bookmark.content.url,
          });
          break;

        case BookmarkTypes.TEXT:
          await Clipboard.setStringAsync(bookmark.content.text);
          toast({
            message: "Text copied to clipboard",
            showProgress: false,
          });
          break;

        case BookmarkTypes.ASSET: {
          const canShare = await Sharing.isAvailableAsync();
          const isShareable =
            canShare &&
            (bookmark.content.assetType === "image" ||
              bookmark.content.assetType === "pdf");

          if (!isShareable) {
            toast({
              message: "Sharing is not available for this file type",
              variant: "destructive",
              showProgress: false,
            });
            break;
          }

          const assetUrl = `${settings.address}/api/assets/${bookmark.content.assetId}`;
          const fileUri =
            bookmark.content.assetType === "pdf"
              ? `${FileSystem.documentDirectory}${bookmark.content.fileName || "document.pdf"}`
              : `${FileSystem.documentDirectory}temp_image.jpg`;
          const downloadResult = await FileSystem.downloadAsync(
            assetUrl,
            fileUri,
            {
              headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
            },
          );
          if (downloadResult.status !== 200) {
            throw new Error("Failed to download file");
          }
          try {
            await Sharing.shareAsync(
              downloadResult.uri,
              bookmark.content.assetType === "pdf"
                ? { mimeType: "application/pdf", UTI: "com.adobe.pdf" }
                : undefined,
            );
          } finally {
            await FileSystem.deleteAsync(downloadResult.uri, {
              idempotent: true,
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error("Share error:", error);
      toast({
        message: "Failed to share",
        variant: "destructive",
        showProgress: false,
      });
    }
  };

  const isFavourited = favouriteVars
    ? favouriteVars.favourited
    : bookmark.favourited;

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
      icon: isFavourited
        ? makeIcon(Star, "#ebb434", "#ebb434")
        : makeIcon(Star),
      shouldRender: isOwner,
      onClick: () => {
        triggerHaptic();
        favouriteBookmark({
          bookmarkId: bookmark.id,
          favourited: !isFavourited,
        });
      },
      disabled: false,
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
      onClick: () =>
        bookmark.content.type === BookmarkTypes.LINK &&
        Linking.openURL(bookmark.content.url),
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

const shouldUseGlassPill = isIOS26 && isGlassEffectAPIAvailable();

function ToolbarContainer({
  children,
  bottomMargin,
  bottomInset,
}: {
  children: React.ReactNode;
  bottomMargin: number;
  bottomInset: number;
}) {
  if (shouldUseGlassPill) {
    return (
      <GlassView
        glassEffectStyle="regular"
        style={{
          borderRadius: 22,
          marginHorizontal: 16,
          marginBottom: bottomMargin,
          paddingVertical: 10,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === "ios") {
    return (
      <BlurView
        tint="systemMaterial"
        intensity={80}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 40,
          paddingTop: 16,
          paddingBottom: bottomInset + 16,
        }}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View
      className="bg-background"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 40,
        paddingTop: 16,
        paddingBottom: bottomInset + 16,
      }}
    >
      {children}
    </View>
  );
}

interface BottomActionsProps {
  bookmark: ZBookmark;
}

export default function BottomActions({ bookmark }: BottomActionsProps) {
  const { barActions, overflowActions, allActions } =
    useToolbarActions(bookmark);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();

  const bottomMargin = shouldUseGlassPill ? Math.max(insets.bottom - 8, 4) : 8;

  // Build native menu actions for the overflow ellipsis
  const menuActions = overflowActions
    .filter((a) => a.shouldRender)
    .map((a) => {
      const meta = TOOLBAR_ACTION_REGISTRY[a.id];
      return {
        id: a.id,
        title: meta.label,
        image: Platform.select({ ios: meta.sfSymbol, default: undefined }),
        imageColor:
          a.id === "delete" ? destructiveMenuIconColor : menuIconColor,
        attributes: {
          ...(a.id === "delete" && { destructive: true as const }),
          ...(a.disabled && { disabled: true as const }),
        },
      };
    });

  // Add separator + "Edit Toolbar..." at the bottom.
  // On iOS, `displayInline` with `subactions` creates a visual separator
  // between overflow items and the edit action. On Android the same structure
  // renders as a nested submenu requiring an extra tap, so we flatten it.
  const editToolbarAction = {
    id: "edit-toolbar",
    title: "Edit Toolbar...",
    image: Platform.select({
      ios: "slider.horizontal.3",
      default: undefined,
    }),
    imageColor: menuIconColor,
  };

  const menuActionsWithEdit =
    Platform.OS === "ios"
      ? [
          ...(menuActions.length > 0
            ? [
                {
                  id: "overflow-group",
                  title: "",
                  displayInline: true as const,
                  subactions: menuActions,
                },
              ]
            : []),
          editToolbarAction,
        ]
      : [...menuActions, editToolbarAction];

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
