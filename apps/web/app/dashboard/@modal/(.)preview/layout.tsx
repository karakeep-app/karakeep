"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PreviewDialogContext } from "@/components/dashboard/preview/PreviewDialogContext";
import { usePreviewNavigation } from "@/components/dashboard/preview/usePreviewNavigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

/**
 * The preview dialog. It's a layout so that it stays open, and keeps its view
 * choices, while moving between bookmarks only swaps the page inside it.
 */
export default function BookmarkPreviewDialogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { bookmarkId } = useParams<{ bookmarkId: string }>();
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("content");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { placeholder, navigation } = usePreviewNavigation({
    bookmarkId,
    containerRef: contentRef,
  });

  const close = () => {
    setOpen(false);
    router.back();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          close();
        }
      }}
    >
      <VisuallyHidden>
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>
      </VisuallyHidden>
      <DialogContent
        ref={contentRef}
        className="h-[90%] max-w-[90%] overflow-hidden rounded-xl p-0 outline-none max-sm:h-dvh max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0"
        hideCloseBtn={true}
        // On the dialog itself, as its first link or button would show a tooltip.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        onInteractOutside={(e) => {
          // Clicking a toast, such as its Undo button, shouldn't close the preview.
          const target = e.detail.originalEvent.target;
          if (
            target instanceof Element &&
            target.closest("[data-sonner-toaster]")
          ) {
            e.preventDefault();
          }
        }}
      >
        <PreviewDialogContext.Provider
          value={{
            placeholder,
            navigation,
            close,
            view: {
              activeTab,
              setActiveTab,
              sidebarCollapsed,
              setSidebarCollapsed,
            },
          }}
        >
          {children}
        </PreviewDialogContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
