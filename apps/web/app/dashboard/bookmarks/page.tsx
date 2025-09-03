import React from "react";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";

export default async function BookmarksPage() {
  return (
    <div>
      <Bookmarks
        query={{
          archived: false,
          // TODO: Seeking feedback - should bookmarks with upcoming reminders be hidden on home?
          hideWithUpcomingReminders: true,
        }}
        showEditorCard={true}
      />
    </div>
  );
}
