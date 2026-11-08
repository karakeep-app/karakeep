"use client";

import { use } from "react";
import BookmarkPreview from "@/components/dashboard/preview/BookmarkPreview";
import { usePreviewDialog } from "@/components/dashboard/preview/PreviewDialogContext";

export default function BookmarkPreviewPage(props: {
  params: Promise<{ bookmarkId: string }>;
}) {
  const { bookmarkId } = use(props.params);
  const { placeholder, navigation, view, close } = usePreviewDialog();

  return (
    <BookmarkPreview
      bookmarkId={bookmarkId}
      placeholderData={placeholder}
      navigation={navigation}
      view={view}
      onClose={close}
    />
  );
}
