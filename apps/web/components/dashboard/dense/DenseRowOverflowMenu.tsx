"use client";

import { useState } from "react";
import DeleteBookmarkConfirmationDialog from "@/components/dashboard/bookmarks/DeleteBookmarkConfirmationDialog";
import { EditBookmarkDialog } from "@/components/dashboard/bookmarks/EditBookmarkDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  MoreHorizontal,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

/**
 * The row's overflow (⋯) menu: open original, archive, edit tags, delete,
 * re-summarise — per the design spec.
 */
export function DenseRowOverflowMenu({ bookmark }: { bookmark: ZBookmark }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const onError = () => toast.error("Something went wrong");

  const { mutate: updateBookmark } = useUpdateBookmark({ onError });
  const { mutate: resummarise, isPending: isResummarising } =
    useSummarizeBookmark({
      onError,
      onSuccess: () => toast.success("Re-summarising…"),
    });

  const url =
    bookmark.content.type === BookmarkTypes.LINK ? bookmark.content.url : null;

  return (
    <>
      <EditBookmarkDialog
        bookmark={bookmark}
        open={editOpen}
        setOpen={setEditOpen}
      />
      <DeleteBookmarkConfirmationDialog
        bookmark={bookmark}
        open={deleteOpen}
        setOpen={setDeleteOpen}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More actions"
            onClick={(e) => e.stopPropagation()}
            className="text-k-fg-dim hover:text-k-fg-muted flex size-[22px] items-center justify-center"
          >
            <MoreHorizontal size={22} strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="border-k-border bg-k-surface-1 text-k-fg"
          onClick={(e) => e.stopPropagation()}
        >
          {url && (
            <DropdownMenuItem asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 size-4" />
                Open original
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              updateBookmark({
                bookmarkId: bookmark.id,
                archived: !bookmark.archived,
              })
            }
          >
            {bookmark.archived ? (
              <ArchiveRestore className="mr-2 size-4" />
            ) : (
              <Archive className="mr-2 size-4" />
            )}
            {bookmark.archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Tag className="mr-2 size-4" />
            Edit tags
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isResummarising}
            onClick={() => resummarise({ bookmarkId: bookmark.id })}
          >
            <Sparkles className="mr-2 size-4" />
            Re-summarise
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
