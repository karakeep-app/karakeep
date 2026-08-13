"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import DenseBookmarkDetail from "@/components/dashboard/dense/DenseBookmarkDetail";
import { MobileBookmarkDetail } from "@/components/dashboard/dense/mobile/MobileBookmarkDetail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  // Radix's Dialog always portals its overlay to <body> once `open`, so
  // hiding it for mobile with a `sm:hidden` wrapper wouldn't work — the
  // overlay would still darken the whole screen with nothing on top of it.
  // Reading matchMedia synchronously here instead: this route only ever
  // mounts from a client-side <Link> navigation (Next intercepts soft nav
  // into this parallel `@modal` slot; a hard nav/refresh renders the plain
  // .../preview/[bookmarkId] page instead, not this one), so it's never
  // part of the initial server-rendered HTML — nothing to hydrate against,
  // so no mismatch from reading `window` up front. `640px` matches
  // Tailwind's own `sm:` breakpoint, same cutoff the rest of the mobile
  // shell uses.
  const [isMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      !window.matchMedia("(min-width: 640px)").matches,
  );

  const setOpenWithRouter = (value: boolean) => {
    setOpen(value);
    if (!value) {
      router.back();
    }
  };

  if (isMobile) {
    return (
      <MobileBookmarkDetail
        bookmarkId={params.bookmarkId}
        onBack={() => setOpenWithRouter(false)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpenWithRouter}>
      <DialogContent
        // Narrower than the old preview's 90%: the read-out is a single
        // 600px column, so a full-bleed dialog would be mostly empty.
        className="border-k-border bg-k-bg h-[86%] max-w-[700px] overflow-hidden rounded-xl p-0"
        hideCloseBtn={true}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Inside DialogContent, not beside it: Radix only mounts the content
        while the dialog is open, so a header placed outside stayed in the DOM
        permanently. Hidden because the read-out renders its own visible title,
        but still needed — these are what aria-labelledby/aria-describedby
        point at, and without the description Radix warns. */}
        <VisuallyHidden>
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              The bookmark&apos;s summary, notes and archived page.
            </DialogDescription>
          </DialogHeader>
        </VisuallyHidden>
        <DenseBookmarkDetail
          bookmarkId={params.bookmarkId}
          onClose={() => setOpenWithRouter(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
