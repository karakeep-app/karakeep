import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import useAppSettings from "@/lib/settings";
import { Check } from "lucide-react-native";

export default function BookmarkGridLayoutSettings() {
  const router = useRouter();
  const { toast } = useToast();
  const { settings, setSettings } = useAppSettings();

  const handleUpdate = async (layout: "grid" | "list") => {
    try {
      await setSettings({
        ...settings,
        bookmarkGridLayout: layout,
      });
      toast({
        message: "Bookmark Layout updated!",
        showProgress: false,
      });
      router.back();
    } catch {
      toast({
        message: "Something went wrong",
        variant: "destructive",
        showProgress: false,
      });
    }
  };

  const options = (["grid", "list"] as const)
    .map((layout) => {
      const currentLayout = settings.bookmarkGridLayout;
      const isChecked = currentLayout === layout;
      return [
        <Pressable
          onPress={() => handleUpdate(layout)}
          className="flex flex-row justify-between"
          key={layout}
        >
          <View className="flex gap-1">
            <Text>{{ grid: "Grid", list: "List" }[layout]}</Text>
            <Text className="text-xs text-muted-foreground">
              {{
                grid: "2-column card grid layout",
                list: "Single column list layout",
              }[layout]}
            </Text>
          </View>
          {isChecked && <Check color="rgb(0, 122, 255)" />}
        </Pressable>,
        <Divider
          key={layout + "-divider"}
          orientation="horizontal"
          className="my-3 h-0.5 w-full"
        />,
      ];
    })
    .flat();
  options.pop();

  return (
    <CustomSafeAreaView>
      <View className="flex h-full w-full items-center px-4 py-2">
        <View className="w-full rounded-lg bg-card bg-card px-4 py-2">
          {options}
        </View>
      </View>
    </CustomSafeAreaView>
  );
}
