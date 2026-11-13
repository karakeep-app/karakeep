import type { MenuAction } from "@react-native-menu/menu";
import { Platform } from "react-native";

/**
 * Groups menu items with a separator on iOS. Android can't show inline groups
 * and turns them into a submenu, hiding the items behind an extra tap, so they
 * stay flat there.
 */
export function inlineMenuGroup(
  id: string,
  actions: MenuAction[],
): MenuAction[] {
  if (Platform.OS !== "ios") {
    return actions;
  }
  return [{ id, title: "", displayInline: true, subactions: actions }];
}
