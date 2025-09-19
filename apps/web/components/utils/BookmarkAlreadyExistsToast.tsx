import Link from "next/link";
import { ExternalLink } from "lucide-react";

export default function BookmarkAlreadyExistsToast({
  bookmarkId,
}: {
  bookmarkId: string;
}) {
  return (
    <div className="flex items-center gap-1">
      Bookmark already exists.
      <Link
        className="flex underline-offset-4 hover:underline"
        href={`/dashboard/preview/${bookmarkId}`}
      >
        Open <ExternalLink className="ml-1 size-4" />
      </Link>
    </div>
  );
}
