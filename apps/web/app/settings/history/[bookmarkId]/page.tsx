import BookmarkHistory from "@/components/dashboard/preview/BookmarkHistory";
/** Open an audit by retained bookmark ID; the history query authorizes it without a live item. */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ bookmarkId: string }>;
}) {
  const { bookmarkId } = await params;
  return (
    <main className="p-5">
      <BookmarkHistory bookmarkId={bookmarkId} initiallyOpen />
    </main>
  );
}
