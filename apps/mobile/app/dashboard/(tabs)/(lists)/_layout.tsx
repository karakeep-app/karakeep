import { Stack } from "expo-router/stack";
import { tabScreenOptions } from "@/lib/tabScreenOptions";

export default function Layout() {
  return (
    <Stack screenOptions={tabScreenOptions}>
      <Stack.Screen name="index" options={{ title: "Lists" }} />
    </Stack>
  );
}
