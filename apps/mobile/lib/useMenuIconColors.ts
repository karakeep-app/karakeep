import { useColorScheme } from "@/lib/useColorScheme";

export function useMenuIconColors() {
  const { colorScheme } = useColorScheme();

  const menuIconColor = colorScheme === "dark" ? "#d1d5db" : "#4b5563";
  const destructiveMenuIconColor =
    colorScheme === "dark" ? "#f87171" : "#dc2626";

  return {
    menuIconColor,
    destructiveMenuIconColor,
  };
}
