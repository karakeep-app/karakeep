import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

export default function SearchTab() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const hasRendered = useRef(false);

  useEffect(() => {
    if (!hasRendered.current) {
      // Skip the initial mount — don't push on app launch
      hasRendered.current = true;
      return;
    }
    if (isFocused) {
      router.push("/dashboard/search");
    }
  }, [isFocused, router]);

  return null;
}
