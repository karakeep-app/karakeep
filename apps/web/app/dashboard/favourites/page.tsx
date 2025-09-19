import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";

export default async function FavouritesBookmarkPage() {
  return (
    <Bookmarks
      header={
        <div className="flex items-center justify-between">
          <p className="text-2xl">⭐️ Favourites</p>
        </div>
      }
      query={{ favourited: true }}
      showDivider={true}
      showEditorCard={true}
    />
  );
}
