"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ExternalLink, NotepadText } from "lucide-react";

interface NotePreviewProps {
  note: string;
  bookmarkId: string;
  className?: string;
}

export function NotePreview({ note, bookmarkId, className }: NotePreviewProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  if (!note?.trim()) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "flex cursor-pointer items-center gap-1.5 text-sm font-light italic text-gray-500 dark:text-gray-400",
            className,
          )}
        >
          <NotepadText className="size-5 shrink-0" />
          <div className="line-clamp-2 min-w-0 flex-1 overflow-hidden text-wrap break-words">
            {note}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)]" align="start">
        <div className="space-y-3">
          <div className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
            {note}
          </div>
          <div className="flex justify-end">
            <Link href={`/dashboard/preview/${bookmarkId}`}>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setIsOpen(false)}
              >
                {t("actions.edit_notes")}
                <ExternalLink className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
