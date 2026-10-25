import { Trash2 } from "lucide-react";

export default function BookmarkDeletedPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Trash2 className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">Bookmark deleted</p>
        <p className="text-sm text-muted-foreground">
          This page was removed from your Karakeep.
        </p>
      </div>
    </div>
  );
}
