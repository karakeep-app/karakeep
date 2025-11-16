import React from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import SharedBookmarks from "@/components/dashboard/bookmarks/SharedBookmarks";

export default async function SharedWithYouPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Shared with you"
        description="Bookmarks from lists shared with you by other users"
      />
      <SharedBookmarks />
    </div>
  );
}
