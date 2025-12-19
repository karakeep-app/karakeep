import { ActivityIndicator, View } from "react-native";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import PageTitle from "@/components/ui/PageTitle";
import { Text } from "@/components/ui/Text";
import { useUserStats, useUserSettings } from "@karakeep/shared-react/hooks/users";
import StatsDisplay from "@karakeep/shared-react/components/stats/StatsDisplay.dom";

export default function StatsPage() {
  const { data: stats, isLoading, error } = useUserStats();
  const { data: userSettings } = useUserSettings();

  if (isLoading) {
    return (
      <CustomSafeAreaView>
        <PageTitle title="Statistics" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="mt-4 text-muted-foreground">Loading statistics...</Text>
        </View>
      </CustomSafeAreaView>
    );
  }

  if (error || !stats) {
    return (
      <CustomSafeAreaView>
        <PageTitle title="Statistics" />
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-center text-muted-foreground">
            Failed to load statistics. Please try again later.
          </Text>
        </View>
      </CustomSafeAreaView>
    );
  }

  return (
    <CustomSafeAreaView>
      <PageTitle title="Statistics" />
      <StatsDisplay stats={stats} timezone={userSettings?.timezone} />
    </CustomSafeAreaView>
  );
}
