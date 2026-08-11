import { MenuView } from "@expo/ui/community/menu";
import type { MenuAction as ExpoMenuAction } from "@expo/ui/community/menu";

import type { BookmarkActionController } from "./use-bookmark-actions";

interface BookmarkCardContextMenuProps {
  actions: BookmarkActionController;
  children: React.ReactElement;
}

export default function BookmarkCardContextMenu({
  actions,
  children,
}: BookmarkCardContextMenuProps) {
  return (
    <MenuView
      actions={actions.contextMenuActions as unknown as ExpoMenuAction[]}
      onPressAction={({ nativeEvent }) => {
        actions.handleAction(nativeEvent.event);
      }}
      shouldOpenOnLongPress
      style={{ alignSelf: "stretch" }}
    >
      {children}
    </MenuView>
  );
}
