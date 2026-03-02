import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import useAppSettings from "@/lib/settings";
import { Check } from "lucide-react-native";

export default function BookmarkDefaultViewSettings() {
  const router = useRouter();
  const { toast } = useToast();
  const { settings, setSettings } = useAppSettings();

  const handleUpdate = async (
    mode: "reader" | "browser" | "externalBrowser",
  ) => {
    try {
      await setSettings({
        ...settings,
        defaultBookmarkView: mode,
      });
      toast({
        message: "Default Bookmark View updated!",
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

  const options = (["reader", "browser", "externalBrowser"] as const)
    .map((mode) => {
      const currentMode = settings.defaultBookmarkView;
      const isChecked = currentMode === mode;
      return [
        <Pressable
          onPress={() => handleUpdate(mode)}
          className="flex flex-row justify-between"
          key={mode}
        >
          <Text>
            {
              {
                browser: "Browser",
                reader: "Reader",
                externalBrowser: "External Browser",
              }[mode]
            }
          </Text>
          {isChecked && <Check color="rgb(0, 122, 255)" />}
        </Pressable>,
        <Divider
          key={mode + "-divider"}
          orientation="horizontal"
          className="my-3 h-0.5 w-full"
        />,
      ];
    })
    .flat();
  options.pop();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="flex w-full items-center px-4 py-2"
    >
      <View className="w-full rounded-lg bg-card px-4 py-2">{options}</View>
    </ScrollView>
  );
}
