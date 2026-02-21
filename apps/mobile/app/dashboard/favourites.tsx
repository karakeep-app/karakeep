import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";

export default function Favourites() {
  return (
    <UpdatingBookmarkList
      query={{
        favourited: true,
      }}
    />
  );
}
