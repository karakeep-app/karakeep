import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";

export default function Archive() {
  return <UpdatingBookmarkList query={{ archived: true }} />;
}
