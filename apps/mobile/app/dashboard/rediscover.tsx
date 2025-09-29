import React from "react";
import { View } from "react-native";
import RediscoveryScreen from "@/components/rediscovery/RediscoveryScreen";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import PageTitle from "@/components/ui/PageTitle";

export default function RediscoverPage() {
  return (
    <CustomSafeAreaView>
      <View className="flex-1 bg-background">
        <PageTitle title="Rediscover Bookmarks" />
        <RediscoveryScreen />
      </View>
    </CustomSafeAreaView>
  );
}
