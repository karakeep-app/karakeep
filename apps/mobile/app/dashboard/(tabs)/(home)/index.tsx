import { useRef, useState } from "react";
import { Platform, PlatformColor, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import InlineSearch from "@/components/search/InlineSearch";
import { ProfileAvatarButton } from "@/components/settings/ProfileAvatarButton";
import AndroidSearchBar from "@/components/ui/AndroidSearchBar";
import { FAB } from "@/components/ui/FAB";
import useAppSettings from "@/lib/settings";
import { useUploadAsset } from "@/lib/upload";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import { Plus } from "lucide-react-native";
import { toast as sonnerToast } from "sonner-native";

function useNewBookmarkActions(openNewBookmarkModal: () => void) {
  const { settings } = useAppSettings();
  const { menuIconColor } = useMenuIconColors();
  const uploadToastIdRef = useRef<string | number | null>(null);
  const { uploadAsset } = useUploadAsset(settings, {
    onSuccess: () => {
      if (uploadToastIdRef.current !== null) {
        sonnerToast.success("Image saved!", { id: uploadToastIdRef.current });
        uploadToastIdRef.current = null;
      }
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
        uploadToastIdRef.current = sonnerToast.loading(
          "Opening photo library...",
        );
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: settings.imageQuality,
          allowsMultipleSelection: false,
        });
        if (!result.canceled) {
          const asset = result.assets[0];
          if (!asset) {
            sonnerToast.dismiss(uploadToastIdRef.current);
            uploadToastIdRef.current = null;
            return;
          }
          sonnerToast.loading("Uploading image...", {
            id: uploadToastIdRef.current,
          });
          uploadAsset({
            type: asset.mimeType ?? "",
            name: asset.fileName ?? "",
            uri: asset.uri,
          });
        } else {
          sonnerToast.dismiss(uploadToastIdRef.current);
          uploadToastIdRef.current = null;
        }
      } catch {
        if (uploadToastIdRef.current !== null) {
          sonnerToast.error("Failed to open photo library", {
            id: uploadToastIdRef.current,
          });
          uploadToastIdRef.current = null;
        } else {
          sonnerToast.error("Failed to open photo library");
        }
      }
    }
  };

  const actions = [
    {
      id: "new",
      title: "New Bookmark",
      image: Platform.select({ ios: "square.and.pencil" }),
      imageColor: Platform.select({ ios: menuIconColor }),
    },
    {
      id: "library",
      title: "Photo Library",
      image: Platform.select({ ios: "photo" }),
      imageColor: Platform.select({ ios: menuIconColor }),
    },
  ];

  return { onPressAction, actions };
}

export default function Home() {
  const [searchActive, setSearchActive] = useState(false);
  const { onPressAction, actions } = useNewBookmarkActions(() =>
    router.push("/dashboard/bookmarks/new"),
  );

  if (Platform.OS === "android" && searchActive) {
    return <InlineSearch onClose={() => setSearchActive(false)} />;
  }

  return (
    <>
      <Stack.Screen
        options={Platform.select({
          ios: {
            headerRight: () => <ProfileAvatarButton />,
          },
          default: {},
        })}
      />
      {Platform.OS === "android" && (
        <AndroidSearchBar
          label="Search bookmarks..."
          onPress={() => setSearchActive(true)}
          rightElement={<ProfileAvatarButton />}
        />
      )}
      <UpdatingBookmarkList query={{ archived: false }} />
      <FAB>
        <MenuView
          onPressAction={onPressAction}
          actions={actions}
          shouldOpenOnLongPress={false}
        >
          <View className="h-full w-full items-center justify-center">
            <Plus
              size={24}
              color={Platform.OS === "ios" ? PlatformColor("label") : "white"}
            />
          </View>
        </MenuView>
      </FAB>
    </>
  );
}
