import { useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { useUploadAsset } from "@/lib/upload";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import { Plus, Search } from "lucide-react-native";
import { toast as sonnerToast } from "sonner-native";

function HeaderRight({
  openNewBookmarkModal,
}: {
  openNewBookmarkModal: () => void;
}) {
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
  return (
    <MenuView
      onPressAction={async ({ nativeEvent }) => {
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
      }}
      actions={[
        {
          id: "new",
          title: "New Bookmark",
          image: Platform.select({
            ios: "square.and.pencil",
          }),
          imageColor: Platform.select({
            ios: menuIconColor,
          }),
        },
        {
          id: "library",
          title: "Photo Library",
          image: Platform.select({
            ios: "photo",
          }),
          imageColor: Platform.select({
            ios: menuIconColor,
          }),
        },
      ]}
      shouldOpenOnLongPress={false}
    >
      <View className="my-auto px-4">
        <Plus
          color="rgb(0, 122, 255)"
          onPress={() => Haptics.selectionAsync()}
        />
      </View>
    </MenuView>
  );
}

export default function Home() {
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderRight
              openNewBookmarkModal={() =>
                router.push("/dashboard/bookmarks/new")
              }
            />
          ),
        }}
      />
      <UpdatingBookmarkList
        query={{ archived: false }}
        header={
          <Pressable
            className="flex flex-row items-center gap-1 rounded-lg border border-input bg-card px-4 py-1"
            onPress={() => router.push("/dashboard/search")}
          >
            <TailwindResolver
              className="text-muted"
              comp={(styles) => (
                <Search size={16} color={styles?.color?.toString()} />
              )}
            />
            <Text className="text-muted">Search</Text>
          </Pressable>
        }
      />
    </>
  );
}
