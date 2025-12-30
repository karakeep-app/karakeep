"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/trpc";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Loader2, X } from "lucide-react";

import { ShareButton } from "./ShareButton";
import { WrappedContent } from "./WrappedContent";

interface WrappedModalProps {
  open: boolean;
  onClose: () => void;
}

export function WrappedModal({ open, onClose }: WrappedModalProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { data: stats, isLoading } = api.users.wrapped.useQuery(undefined, {
    enabled: open,
  });
  const { data: whoami } = api.users.whoami.useQuery(undefined, {
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogOverlay className="z-50" />
      <DialogContent
        className="max-w-screen h-screen max-h-screen w-screen overflow-hidden rounded-none border-none p-0"
        hideCloseBtn={true}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Your 2025 Wrapped</DialogTitle>
        </VisuallyHidden.Root>
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
          {/* Share button overlay */}
          {stats && !isLoading && <ShareButton contentRef={contentRef} />}
          {/* Close button overlay */}
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 backdrop-blur-sm transition-colors hover:bg-white/20"
            aria-label="Close"
            title="Close"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex h-full items-center justify-center bg-slate-950 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(16,185,129,0.18),transparent),radial-gradient(900px_500px_at_90%_10%,rgba(14,116,144,0.2),transparent)]">
            <div className="text-center text-white">
              <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin" />
              <p className="text-xl">Loading your Wrapped...</p>
            </div>
          </div>
        ) : stats ? (
          <WrappedContent
            ref={contentRef}
            stats={stats}
            userName={whoami?.name || undefined}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-950 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(16,185,129,0.18),transparent),radial-gradient(900px_500px_at_90%_10%,rgba(14,116,144,0.2),transparent)]">
            <div className="text-center text-white">
              <p className="text-xl">Failed to load your Wrapped stats</p>
              <button
                onClick={onClose}
                className="mt-4 rounded-lg bg-white/20 px-6 py-2 backdrop-blur-sm hover:bg-white/30"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
