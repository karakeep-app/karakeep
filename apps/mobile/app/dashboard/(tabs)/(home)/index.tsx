import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { router, Stack } from "expo-router";
import { AppIcon } from "@/components/ui/AppIcon";
import BookmarkListHeader from "@/components/bookmarks/BookmarkListHeader";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import InlineSearch from "@/components/search/InlineSearch";
import { ProfileAvatarButton } from "@/components/settings/ProfileAvatarButton";
import AndroidSearchBar from "@/components/ui/AndroidSearchBar";
import { FAB } from "@/components/ui/FAB";
import { showOrganizeToast, showUndoToast } from "@/components/ui/Toast";

import useAppSettings from "@/lib/settings";
import { useUploadAsset } from "@/lib/upload";
import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import { Plus } from "lucide-react-native";
import { toast as sonnerToast } from "sonner-native";
import {
  useCreateBookmark,
  useDeleteBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

/**
 * The picker can re-encode a HEIC original to JPEG while still describing it by
 * the original's name and type, so trust the extension of the file it produced.
 */
function getUploadableImageFile(asset: ImagePicker.ImagePickerAsset) {
  const extension = asset.uri.split(".").pop()?.toLowerCase();
  const type =
    extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : (asset.mimeType ?? "image/jpeg");
  const baseName = (asset.fileName ?? "photo").replace(/\.[^.]+$/, "");
  return { type, name: `${baseName}.${type.split("/")[1]}` };
}

function useNewBookmarkActions(openNewBookmarkModal: () => void) {
  const { settings } = useAppSettings();
  const { t } = useTranslation();
  const { menuIconColor } = useMenuIconColors();
  const uploadToastIdRef = useRef<string | number | null>(null);
  const createBookmark = useCreateBookmark();
  const { mutate: deleteBookmark } = useDeleteBookmark();

  const { uploadAsset } = useUploadAsset(settings, {
    onSuccess: (bookmark) => {
      if (uploadToastIdRef.current !== null) {
        sonnerToast.dismiss(uploadToastIdRef.current);
        uploadToastIdRef.current = null;
      }
      showOrganizeToast(t("home.photo_saved"), bookmark.id);
    },
    onError: (e) => {
      if (uploadToastIdRef.current !== null) {
        sonnerToast.error(e, { id: uploadToastIdRef.current });
        uploadToastIdRef.current = null;
      } else {
        sonnerToast.error(e);
      }
    },
  });

  const onPressAction = async ({
    nativeEvent,
  }: {
    nativeEvent: { event: string };
  }) => {
    Haptics.selectionAsync();
    if (nativeEvent.event === "new") {
      openNewBookmarkModal();
    } else if (nativeEvent.event === "library") {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: settings.imageQuality,
          allowsMultipleSelection: false,
          // Hand us JPEGs rather than HEIC, which the server can't store.
          preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode
              .Compatible,
        });
        if (!result.canceled) {
          const asset = result.assets[0];
          if (!asset) {
            return;
          }
          uploadToastIdRef.current = sonnerToast.loading(
            t("home.uploading_photo"),
          );
          uploadAsset({
            ...getUploadableImageFile(asset),
            uri: asset.uri,
          });
        }
      } catch {
        if (uploadToastIdRef.current !== null) {
          sonnerToast.error(t("home.failed_open_photo_library"), {
            id: uploadToastIdRef.current,
          });
          uploadToastIdRef.current = null;
        } else {
          sonnerToast.error(t("home.failed_open_photo_library"));
        }
      }
    } else if (nativeEvent.event === "clipboard") {
      if (createBookmark.isPending) return;

      const toastId = sonnerToast.loading(t("home.reading_clipboard_status"));
      try {
        const contents = (await Clipboard.getStringAsync()).trim();
        if (!contents) {
          sonnerToast.error(t("home.clipboard_empty"), { id: toastId });
          return;
        }

        let isUrl = false;
        try {
          const parsed = new URL(contents);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            isUrl = true;
            sonnerToast.loading(t("home.saving_link"), { id: toastId });
          }
        } catch {
          // not a valid URL — treat as text
          sonnerToast.loading(t("home.saving_note"), { id: toastId });
        }

        const resp = await (isUrl
          ? createBookmark.mutateAsync({
              type: BookmarkTypes.LINK,
              url: new URL(contents).toString(),
              source: "mobile",
            })
          : createBookmark.mutateAsync({
              type: BookmarkTypes.TEXT,
              text: contents,
              source: "mobile",
            }));
        sonnerToast.dismiss(toastId);
        if (resp.alreadyExists) {
          showOrganizeToast(t("bookmarks.already_saved"), resp.id);
        } else {
          // Nothing was on screen before this saved, so name it and allow undo.
          showUndoToast(
            t("home.saved_named", { text: contents.slice(0, 40) }),
            () => deleteBookmark({ bookmarkId: resp.id }),
          );
        }
      } catch (e) {
        sonnerToast.error(
          e instanceof Error ? e.message : t("home.failed_save_clipboard"),
          { id: toastId },
        );
      }
    }
  };

  const actions = [
    {
      id: "clipboard",
      title: t("home.menu_save_from_clipboard"),
      image: Platform.select({ ios: "clipboard" }),
      imageColor: Platform.select({ ios: menuIconColor }),
    },
    {
      id: "new",
      title: t("home.menu_new_link_or_note"),
      image: Platform.select({ ios: "square.and.pencil" }),
      imageColor: Platform.select({ ios: menuIconColor }),
    },
    {
      id: "library",
      title: t("home.menu_add_from_photos"),
      image: Platform.select({ ios: "photo" }),
      imageColor: Platform.select({ ios: menuIconColor }),
    },
  ];

  return { onPressAction, actions };
}

export default function Home() {
  const { t } = useTranslation();
  const { colors } = useColorScheme();
  const [searchActive, setSearchActive] = useState(false);
  const { onPressAction, actions } = useNewBookmarkActions(() =>
    router.push("/dashboard/bookmarks/new"),
  );

  if (Platform.OS === "android" && searchActive) {
    return <InlineSearch onClose={() => setSearchActive(false)} />;
  }

  return (
    <>
      {Platform.OS === "android" && (
        <AndroidSearchBar
          label={t("search.search_bookmarks")}
          onPress={() => setSearchActive(true)}
          rightElement={<ProfileAvatarButton />}
          trailingElement={<BookmarkListHeader />}
        />
      )}
      <UpdatingBookmarkList
        header={<ConnectionBanner />}
        query={{ archived: false }}
        scrollToTopOnSave
        emptyState={{
          title: t("home.empty_title"),
          subtitle: t("home.empty_subtitle"),
          actionLabel: t("home.empty_action"),
          onAction: () => router.push("/dashboard/bookmarks/new"),
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Screen
          options={{
            headerRight: () => (
              <View className="flex-row items-center gap-3 px-1">
                <MenuView
                  onPressAction={onPressAction}
                  actions={actions}
                  shouldOpenOnLongPress={false}
                >
                  <View
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={t("home.add_bookmark_label")}
                    className="h-9 w-9 items-center justify-center"
                  >
                    <AppIcon icon={Plus} size={21} color={colors.foreground} />
                  </View>
                </MenuView>
                <ProfileAvatarButton />
              </View>
            ),
          }}
        />
      ) : (
        <FAB>
          <MenuView
            onPressAction={onPressAction}
            actions={actions}
            shouldOpenOnLongPress={false}
          >
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("home.add_bookmark_label")}
              className="h-full w-full items-center justify-center"
            >
              <Plus size={26} color="white" />
            </View>
          </MenuView>
        </FAB>
      )}
    </>
  );
}
