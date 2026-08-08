"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import DenseBookmarkDetail from "@/components/dashboard/dense/DenseBookmarkDetail";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export default function BookmarkPreviewPage(props: {
  params: Promise<{ bookmarkId: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();

  const [open, setOpen] = useState(true);

  const setOpenWithRouter = (value: boolean) => {
    setOpen(value);
    if (!value) {
      router.back();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpenWithRouter}>
      <VisuallyHidden>
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>
      </VisuallyHidden>
      <DialogContent
        // Narrower than the old preview's 90%: the read-out is a single
        // 600px column, so a full-bleed dialog would be mostly empty.
        className="border-k-border bg-k-bg h-[86%] max-w-[700px] overflow-hidden rounded-xl p-0"
        hideCloseBtn={true}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DenseBookmarkDetail
          bookmarkId={params.bookmarkId}
          onClose={() => setOpenWithRouter(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
