import { Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import { TailwindResolver } from "@/components/TailwindResolver";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import PageTitle from "@/components/ui/PageTitle";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import useAppSettings from "@/lib/settings";
import { useUploadAsset } from "@/lib/upload";
import { MenuView } from "@react-native-menu/menu";
import { Plus, Search } from "lucide-react-native";

function HeaderRight({
  openNewBookmarkModal,
}: {
  openNewBookmarkModal: () => void;
}) {
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const { uploadAsset } = useUploadAsset(settings, {
    onError: (e) => {
      toast({ message: e, variant: "destructive" });
    },
  });
  return (
    <MenuView
      onPressAction={async ({ nativeEvent }) => {
        Haptics.selectionAsync();
        if (nativeEvent.event === "new") {
          openNewBookmarkModal();
        } else if (nativeEvent.event === "library") {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: settings.imageQuality,
            allowsMultipleSelection: false,
          });
          if (!result.canceled) {
            uploadAsset({
              type: result.assets[0].mimeType ?? "",
              name: result.assets[0].fileName ?? "",
              uri: result.assets[0].uri,
            });
          }
        }
      }}
      actions={[
        {
          id: "new",
          title: "New Bookmark",
          image: Platform.select({
            ios: "note.text",
          }),
        },
        {
          id: "library",
          title: "Photo Library",
          image: Platform.select({
            ios: "photo",
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
    <CustomSafeAreaView>
      <UpdatingBookmarkList
        query={{ archived: false }}
        header={
          <View className="flex flex-col gap-1">
            <View className="flex flex-row justify-between">
              <PageTitle title="Home" className="pb-2" />
              <HeaderRight
                openNewBookmarkModal={() =>
                  router.push("/dashboard/bookmarks/new")
                }
              />
            </View>
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
          </View>
        }
      />
    </CustomSafeAreaView>
  );
}
