import { Pressable, View } from "react-native";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { Check } from "lucide-react-native";

export default function ThemePage() {
  const { settings, setSettings } = useAppSettings();

  const options = (["light", "dark", "system"] as const)
    .map((theme) => {
      const isChecked = settings.theme === theme;
      return [
        <Pressable
          onPress={() => setSettings({ ...settings, theme })}
          className="flex flex-row justify-between"
          key={theme}
        >
          <Text>
            {
              { light: "Light Mode", dark: "Dark Mode", system: "System" }[
                theme
              ]
            }
          </Text>
          {isChecked && <Check color="rgb(0, 122, 255)" />}
        </Pressable>,
        <Divider
          key={theme + "-divider"}
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
        <View className="w-full rounded-lg bg-card px-4 py-2">{options}</View>
      </View>
    </CustomSafeAreaView>
  );
}
