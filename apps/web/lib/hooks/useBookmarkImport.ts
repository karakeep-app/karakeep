"use client";

import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation } from "@tanstack/react-query";

import {
  useCreateBookmarkWithPostHook,
  useUpdateBookmarkTags,
} from "@karakeep/shared-react/hooks/bookmarks";
import {
  useAddBookmarkToList,
  useCreateBookmarkList,
} from "@karakeep/shared-react/hooks/lists";
import { api } from "@karakeep/shared-react/trpc";
import {
  importBookmarksFromFile,
  ImportSource,
  ParsedBookmark,
  parseImportFile,
} from "@karakeep/shared/import-export";
import {
  BookmarkTypes,
  MAX_BOOKMARK_TITLE_LENGTH,
} from "@karakeep/shared/types/bookmarks";

import { useCreateImportSession } from "./useImportSessions";

export interface ImportProgress {
  done: number;
  total: number;
}

export function useBookmarkImport() {
  const { t } = useTranslation();

  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const apiUtils = api.useUtils();
  const { mutateAsync: createImportSession } = useCreateImportSession();
  const { mutateAsync: createBookmark } = useCreateBookmarkWithPostHook();
  const { mutateAsync: createList } = useCreateBookmarkList();
  const { mutateAsync: addToList } = useAddBookmarkToList();
  const { mutateAsync: updateTags } = useUpdateBookmarkTags();

  const uploadBookmarkFileMutation = useMutation({
    mutationFn: async ({
      file,
      source,
    }: {
      file: File;
      source: ImportSource;
    }) => {
      // Clear any previous quota error
      setQuotaError(null);

      // First, parse the file to count bookmarks
      const textContent = await file.text();
      const parsedBookmarks = parseImportFile(source, textContent);
      const bookmarkCount = parsedBookmarks.length;

      // Check quota before proceeding
      if (bookmarkCount > 0) {
        const quotaUsage =
          await apiUtils.client.subscriptions.getQuotaUsage.query();

        if (
          !quotaUsage.bookmarks.unlimited &&
          quotaUsage.bookmarks.quota !== null
        ) {
          const remaining =
            quotaUsage.bookmarks.quota - quotaUsage.bookmarks.used;

          if (remaining < bookmarkCount) {
            const errorMsg = `Cannot import ${bookmarkCount} bookmarks. You have ${remaining} bookmark${remaining === 1 ? "" : "s"} remaining in your quota of ${quotaUsage.bookmarks.quota}.`;
            setQuotaError(errorMsg);
            throw new Error(errorMsg);
          }
        }
      }

      // Proceed with import if quota check passes
      // Use a custom parser to avoid re-parsing the file
      const result = await importBookmarksFromFile(
        {
          file,
          source,
          rootListName: t("settings.import.imported_bookmarks"),
          deps: {
            createImportSession,
            createList,
            createBookmark: async (
              bookmark: ParsedBookmark,
              sessionId: string,
            ) => {
              if (bookmark.content === undefined) {
                throw new Error("Content is undefined");
              }
              const created = await createBookmark({
                crawlPriority: "low",
                title: bookmark.title.substring(0, MAX_BOOKMARK_TITLE_LENGTH),
                createdAt: bookmark.addDate
                  ? new Date(bookmark.addDate * 1000)
                  : undefined,
                note: bookmark.notes,
                archived: bookmark.archived,
                importSessionId: sessionId,
                source: "import",
                ...(bookmark.content.type === BookmarkTypes.LINK
                  ? {
                      type: BookmarkTypes.LINK,
                      url: bookmark.content.url,
                    }
                  : {
                      type: BookmarkTypes.TEXT,
                      text: bookmark.content.text,
                    }),
              });
              return created as { id: string; alreadyExists?: boolean };
            },
            addBookmarkToLists: async ({
              bookmarkId,
              listIds,
            }: {
              bookmarkId: string;
              listIds: string[];
            }) => {
              await Promise.all(
                listIds.map((listId) =>
                  addToList({
                    bookmarkId,
                    listId,
                  }),
                ),
              );
            },
            updateBookmarkTags: async ({
              bookmarkId,
              tags,
            }: {
              bookmarkId: string;
              tags: string[];
            }) => {
              if (tags.length > 0) {
                await updateTags({
                  bookmarkId,
                  attach: tags.map((t) => ({ tagName: t })),
                  detach: [],
                });
              }
            },
          },
          onProgress: (done, total) => setImportProgress({ done, total }),
        },
        {
          // Use a custom parser to avoid re-parsing the file
          parsers: {
            [source]: () => parsedBookmarks,
          },
        },
      );
      return result;
    },
    onSuccess: async (result) => {
      setImportProgress(null);

      if (result.counts.total === 0) {
        toast({ description: "No bookmarks found in the file." });
        return;
      }
      const { successes, failures, alreadyExisted } = result.counts;
      if (successes > 0 || alreadyExisted > 0) {
        toast({
          description: `Imported ${successes} bookmarks into import session. Background processing will start automatically.`,
          variant: "default",
        });
      }
      if (failures > 0) {
        toast({
          description: `Failed to import ${failures} bookmarks. Check console for details.`,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      setImportProgress(null);
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    importProgress,
    quotaError,
    clearQuotaError: () => setQuotaError(null),
    runUploadBookmarkFile: uploadBookmarkFileMutation.mutateAsync,
    isImporting: uploadBookmarkFileMutation.isPending,
  };
}
