"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import FilePickerButton from "@/components/ui/file-picker-button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";
import {
  ParsedBookmark,
  parseHoarderBookmarkFile,
  parseNetscapeBookmarkFile,
  parsePocketBookmarkFile,
} from "@/lib/importBookmarkParser";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Download, Upload } from "lucide-react";

import {
  useCreateBookmarkWithPostHook,
  useUpdateBookmark,
  useUpdateBookmarkTags,
} from "@hoarder/shared-react/hooks/bookmarks";
import {
  useAddBookmarkToList,
  useCreateBookmarkList,
} from "@hoarder/shared-react/hooks/lists";
import { BookmarkTypes } from "@hoarder/shared/types/bookmarks";

export function ExportButton() {
  return (
    <Link
      href="/api/bookmarks/export"
      className={cn(
        buttonVariants({ variant: "default" }),
        "flex items-center gap-2",
      )}
    >
      <Download />
      <p>Export Links and Notes</p>
    </Link>
  );
}

export function ImportExportRow() {
  const router = useRouter();

  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const { mutateAsync: createBookmark } = useCreateBookmarkWithPostHook();
  const { mutateAsync: updateBookmark } = useUpdateBookmark();
  const { mutateAsync: createList } = useCreateBookmarkList();
  const { mutateAsync: addToList } = useAddBookmarkToList();
  const { mutateAsync: updateTags } = useUpdateBookmarkTags();

  const { mutateAsync: parseAndCreateBookmark } = useMutation({
    mutationFn: async (toImport: {
      bookmark: ParsedBookmark;
      listId: string;
    }) => {
      const bookmark = toImport.bookmark;
      if (bookmark.content === undefined) {
        throw new Error("Content is undefined");
      }
      const created = await createBookmark(
        bookmark.content.type === BookmarkTypes.LINK
          ? {
              type: BookmarkTypes.LINK,
              url: bookmark.content.url,
            }
          : {
              type: BookmarkTypes.TEXT,
              text: bookmark.content.text,
            },
      );

      await Promise.all([
        // Update title and createdAt if they're set
        bookmark.title.length > 0 || bookmark.addDate
          ? updateBookmark({
              bookmarkId: created.id,
              title: bookmark.title,
              createdAt: bookmark.addDate
                ? new Date(bookmark.addDate * 1000)
                : undefined,
              note: bookmark.notes,
            }).catch(() => {
              /* empty */
            })
          : undefined,

        // Add to import list
        addToList({
          bookmarkId: created.id,
          listId: toImport.listId,
        }).catch((e) => {
          if (
            e instanceof TRPCClientError &&
            e.message.includes("already in the list")
          ) {
            /* empty */
          } else {
            throw e;
          }
        }),

        // Update tags
        bookmark.tags.length > 0
          ? updateTags({
              bookmarkId: created.id,
              attach: bookmark.tags.map((t) => ({ tagName: t })),
              detach: [],
            })
          : undefined,
      ]);
      return created;
    },
  });

  const { mutateAsync: runUploadBookmarkFile } = useMutation({
    mutationFn: async ({
      file,
      source,
    }: {
      file: File;
      source: "html" | "pocket" | "hoarder";
    }) => {
      if (source === "html") {
        return await parseNetscapeBookmarkFile(file);
      } else if (source === "pocket") {
        return await parsePocketBookmarkFile(file);
      } else if (source === "hoarder") {
        return await parseHoarderBookmarkFile(file);
      } else {
        throw new Error("Unknown source");
      }
    },
    onSuccess: async (resp) => {
      const importList = await createList({
        name: `Imported Bookmarks`,
        icon: "⬆️",
      });
      setImportProgress({ done: 0, total: resp.length });

      const successes = [];
      const failed = [];
      const alreadyExisted = [];
      // Do the imports one by one
      for (const parsedBookmark of resp) {
        try {
          const result = await parseAndCreateBookmark({
            bookmark: parsedBookmark,
            listId: importList.id,
          });
          if (result.alreadyExists) {
            alreadyExisted.push(parsedBookmark);
          } else {
            successes.push(parsedBookmark);
          }
        } catch (e) {
          failed.push(parsedBookmark);
        }
        setImportProgress((prev) => ({
          done: (prev?.done ?? 0) + 1,
          total: resp.length,
        }));
      }

      if (successes.length > 0 || alreadyExisted.length > 0) {
        toast({
          description: `Imported ${successes.length} bookmarks and skipped ${alreadyExisted.length} bookmarks that already existed`,
          variant: "default",
        });
      }

      if (failed.length > 0) {
        toast({
          description: `Failed to import ${failed.length} bookmarks`,
          variant: "destructive",
        });
      }

      router.push(`/dashboard/lists/${importList.id}`);
    },
    onError: (error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row flex-wrap gap-2">
        <FilePickerButton
          loading={false}
          accept=".html"
          multiple={false}
          className="flex items-center gap-2"
          onFileSelect={(file) =>
            runUploadBookmarkFile({ file, source: "html" })
          }
        >
          <Upload />
          <p>Import Bookmarks from HTML file</p>
        </FilePickerButton>

        <FilePickerButton
          loading={false}
          accept=".html"
          multiple={false}
          className="flex items-center gap-2"
          onFileSelect={(file) =>
            runUploadBookmarkFile({ file, source: "pocket" })
          }
        >
          <Upload />
          <p>Import Bookmarks from Pocket export</p>
        </FilePickerButton>
        <FilePickerButton
          loading={false}
          accept=".json"
          multiple={false}
          className="flex items-center gap-2"
          onFileSelect={(file) =>
            runUploadBookmarkFile({ file, source: "hoarder" })
          }
        >
          <Upload />
          <p>Import Bookmarks from Hoarder export</p>
        </FilePickerButton>
        <ExportButton />
      </div>
      {importProgress && (
        <div className="flex flex-col gap-2">
          <p className="shrink-0 text-sm">
            Processed {importProgress.done} of {importProgress.total} bookmarks
          </p>
          <div className="w-full">
            <Progress
              value={(importProgress.done * 100) / importProgress.total}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportExport() {
  return (
    <div className="flex w-full flex-col gap-2">
      <p className="mb-4 text-lg font-medium">Import / Export Bookmarks</p>
      <ImportExportRow />
    </div>
  );
}
