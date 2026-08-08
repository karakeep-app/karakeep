import { notFound } from "next/navigation";
import DenseBookmarkDetail from "@/components/dashboard/dense/DenseBookmarkDetail";
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
    // -m-4 cancels the dashboard shell's padding so the read-out's own
    // 22/34px gutters are the only ones, same as DenseFilesView does.
    //
    // Deliberately no height here: `<main>` is already the scroller, and a
    // viewport-unit height would be re-multiplied by the wrapper's `zoom`
    // (see the note in dashboard/layout.tsx) — at 1.376x, `100dvh - 2rem`
    // measured 1139px inside an 860px viewport and produced a second,
    // taller-than-the-screen scrollbar.
    <div className="-m-4">
      <DenseBookmarkDetail bookmarkId={bookmark.id} initialData={bookmark} />
    </div>
  );
}
