"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/use-toast";
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
} from "@karakeep/shared/import-export";
import {
  BookmarkTypes,
  MAX_BOOKMARK_TITLE_LENGTH,
} from "@karakeep/shared/types/bookmarks";

export interface ImportProgress {
  done: number;
  total: number;
}

export function useBookmarkImport() {
  const { t } = useTranslation();
  const router = useRouter();

  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const [currentImportSessionId, setCurrentImportSessionId] = useState<
    string | null
  >(null);

  const { mutateAsync: createBookmark } = useCreateBookmarkWithPostHook();
  const { mutateAsync: createList } = useCreateBookmarkList();
  const { mutateAsync: addToList } = useAddBookmarkToList();
  const { mutateAsync: updateTags } = useUpdateBookmarkTags();
  const apiUtils = api.useUtils();

  const uploadBookmarkFileMutation = useMutation({
    mutationFn: async ({
      file,
      source,
    }: {
      file: File;
      source: ImportSource;
    }) => {
      // Create an import session for this file import
      const sessionName = `${source.charAt(0).toUpperCase() + source.slice(1)} Import - ${new Date().toLocaleDateString()}`;
      const sessionResult =
        await apiUtils.client.importSessions.createImportSession.mutate({
          name: sessionName,
        });
      setCurrentImportSessionId(sessionResult.id);

      const result = await importBookmarksFromFile(
        {
          file,
          source,
          rootListName: t("settings.import.imported_bookmarks"),
          deps: {
            createList: createList,
            createBookmark: async (bookmark: ParsedBookmark) => {
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
                // Import session flags to skip background jobs initially
                skipCrawling: true,
                skipInference: true,
                skipPreprocessing: true,
                importSessionId: sessionResult.id,
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
        {},
      );
      return result;
    },
    onSuccess: async (result) => {
      setImportProgress(null);
      setCurrentImportSessionId(null);

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

      // Start processing the import session if there were successful imports
      if (successes > 0 && currentImportSessionId) {
        try {
          await apiUtils.client.importSessions.startImportSessionProcessing.mutate(
            {
              importSessionId: currentImportSessionId,
            },
          );
        } catch (error) {
          console.error("Failed to start import session processing:", error);
        }
      }

      if (result.rootListId)
        router.push(`/dashboard/lists/${result.rootListId}`);
    },
    onError: (error) => {
      setImportProgress(null);
      setCurrentImportSessionId(null);
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    importProgress,
    runUploadBookmarkFile: uploadBookmarkFileMutation.mutateAsync,
    isImporting: uploadBookmarkFileMutation.isPending,
  };
}
