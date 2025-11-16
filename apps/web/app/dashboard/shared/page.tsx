import React from "react";
import SharedBookmarks from "@/components/dashboard/bookmarks/SharedBookmarks";

export default async function SharedWithYouPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Shared with you</h1>
        <p className="text-sm text-muted-foreground">
          Bookmarks from lists shared with you by other users
        </p>
      </div>
      <SharedBookmarks />
    </div>
  );
}
