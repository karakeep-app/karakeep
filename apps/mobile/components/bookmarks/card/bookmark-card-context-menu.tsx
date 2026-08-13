import type { BookmarkActionController } from "./use-bookmark-actions";

interface BookmarkCardContextMenuProps {
  actions: BookmarkActionController;
  children: React.ReactElement;
}

export default function BookmarkCardContextMenu({
  children,
}: BookmarkCardContextMenuProps) {
  return children;
}
