import { Stack } from "expo-router/stack";
import { tabScreenOptions } from "@/lib/tabScreenOptions";

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        ...tabScreenOptions,
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Home" }} />
    </Stack>
  );
}
