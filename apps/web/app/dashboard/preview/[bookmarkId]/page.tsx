import { notFound } from "next/navigation";
import BookmarkPreview from "@/components/dashboard/preview/BookmarkPreview";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export default async function BookmarkPreviewPage(props: {
  params: Promise<{ bookmarkId: string }>;
}) {
  const params = await props.params;
  let bookmark;
  try {
    bookmark = await api.bookmarks.getBookmark({
      bookmarkId: params.bookmarkId,
    });
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code === "NOT_FOUND") {
        notFound();
      }
    }
    throw e;
  }

  return (
    // On phones the preview takes over the screen, with its own back button, so
    // that the dashboard's header and nav don't sit above the article.
    <div className="h-[calc(100dvh-theme(spacing.16)-theme(spacing.8))] overflow-hidden max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:h-dvh sm:h-[calc(100dvh-theme(spacing.16)-theme(spacing.8)-theme(spacing.2)-2px)]">
      <BookmarkPreview bookmarkId={bookmark.id} initialData={bookmark} />
    </div>
  );
}
