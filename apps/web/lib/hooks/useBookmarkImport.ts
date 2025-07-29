"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";
import {
  deduplicateBookmarks,
  ParsedBookmark,
  parseKarakeepBookmarkFile,
  parseLinkwardenBookmarkFile,
  parseNetscapeBookmarkFile,
  parseOmnivoreBookmarkFile,
  parsePocketBookmarkFile,
  parseTabSessionManagerStateFile,
} from "@/lib/importBookmarkParser";
import { useMutation } from "@tanstack/react-query";

import {
  useCreateBookmarkWithPostHook,
  useUpdateBookmarkTags,
} from "@karakeep/shared-react/hooks/bookmarks";
import {
  useAddBookmarkToList,
  useCreateBookmarkList,
} from "@karakeep/shared-react/hooks/lists";
import { limitConcurrency } from "@karakeep/shared/concurrency";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

export type ImportSource =
  | "html"
  | "pocket"
  | "omnivore"
  | "karakeep"
  | "linkwarden"
  | "tab-session-manager";

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

  const { mutateAsync: createBookmark } = useCreateBookmarkWithPostHook();
  const { mutateAsync: createList } = useCreateBookmarkList();
  const { mutateAsync: addToList } = useAddBookmarkToList();
  const { mutateAsync: updateTags } = useUpdateBookmarkTags();

  const { mutateAsync: parseAndCreateBookmark } = useMutation({
    mutationFn: async (toImport: {
      bookmark: ParsedBookmark;
      listIds: string[];
    }) => {
      const bookmark = toImport.bookmark;
      if (bookmark.content === undefined) {
        throw new Error("Content is undefined");
      }
      const created = await createBookmark({
        crawlPriority: "low",
        title: bookmark.title,
        createdAt: bookmark.addDate
          ? new Date(bookmark.addDate * 1000)
          : undefined,
        note: bookmark.notes,
        archived: bookmark.archived,
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

      await Promise.all([
        ...toImport.listIds.map((listId) =>
          addToList({
            bookmarkId: created.id,
            listId,
          }),
        ),
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

  const uploadBookmarkFileMutation = useMutation({
    mutationFn: async ({
      file,
      source,
    }: {
      file: File;
      source: ImportSource;
    }) => {
      if (source === "html") {
        return await parseNetscapeBookmarkFile(file);
      } else if (source === "pocket") {
        return await parsePocketBookmarkFile(file);
      } else if (source === "karakeep") {
        return await parseKarakeepBookmarkFile(file);
      } else if (source === "omnivore") {
        return await parseOmnivoreBookmarkFile(file);
      } else if (source === "linkwarden") {
        return await parseLinkwardenBookmarkFile(file);
      } else if (source === "tab-session-manager") {
        return await parseTabSessionManagerStateFile(file);
      } else {
        throw new Error("Unknown source");
      }
    },
    onSuccess: async (parsedBookmarks) => {
      if (parsedBookmarks.length === 0) {
        toast({ description: "No bookmarks found in the file." });
        return;
      }

      const rootList = await createList({
        name: t("settings.import.imported_bookmarks"),
        icon: "⬆️",
      });

      const finalBookmarksToImport = deduplicateBookmarks(parsedBookmarks);

      setImportProgress({ done: 0, total: finalBookmarksToImport.length });

      const allRequiredPaths = new Set<string>();
      for (const bookmark of finalBookmarksToImport) {
        for (const path of bookmark.paths) {
          if (path && path.length > 0) {
            for (let i = 1; i <= path.length; i++) {
              const subPath = path.slice(0, i);
              const pathKey = subPath.join("/");
              allRequiredPaths.add(pathKey);
            }
          }
        }
      }

      const allRequiredPathsArray = Array.from(allRequiredPaths).sort(
        (a, b) => a.split("/").length - b.split("/").length,
      );

      const pathMap: Record<string, string> = {};
      pathMap[""] = rootList.id;

      for (const pathKey of allRequiredPathsArray) {
        const parts = pathKey.split("/");
        const parentKey = parts.slice(0, -1).join("/");
        const parentId = pathMap[parentKey] || rootList.id;

        const folderName = parts[parts.length - 1];
        const folderList = await createList({
          name: folderName,
          parentId: parentId,
          icon: "📁",
        });
        pathMap[pathKey] = folderList.id;
      }

      const importPromises = finalBookmarksToImport.map(
        (bookmark) => async () => {
          const listIds = bookmark.paths.map(
            (path) => pathMap[path.join("/")] || rootList.id,
          );
          if (listIds.length === 0) {
            listIds.push(rootList.id);
          }

          try {
            const created = await parseAndCreateBookmark({
              bookmark: bookmark,
              listIds,
            });

            setImportProgress((prev) => {
              const newDone = (prev?.done ?? 0) + 1;
              return {
                done: newDone,
                total: finalBookmarksToImport.length,
              };
            });
            return { status: "fulfilled" as const, value: created };
          } catch {
            setImportProgress((prev) => {
              const newDone = (prev?.done ?? 0) + 1;
              return {
                done: newDone,
                total: finalBookmarksToImport.length,
              };
            });
            return { status: "rejected" as const };
          }
        },
      );

      const CONCURRENCY_LIMIT = 20;
      const resultsPromises = limitConcurrency(
        importPromises,
        CONCURRENCY_LIMIT,
      );

      const results = await Promise.all(resultsPromises);

      let successes = 0;
      let failures = 0;
      let alreadyExisted = 0;

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.alreadyExists) {
            alreadyExisted++;
          } else {
            successes++;
          }
        } else {
          failures++;
        }
      }

      if (successes > 0 || alreadyExisted > 0) {
        toast({
          description: `Imported ${successes} bookmarks and skipped ${alreadyExisted} bookmarks that already existed`,
          variant: "default",
        });
      }

      if (failures > 0) {
        toast({
          description: `Failed to import ${failures} bookmarks. Check console for details.`,
          variant: "destructive",
        });
      }

      router.push(`/dashboard/lists/${rootList.id}`);
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
    runUploadBookmarkFile: uploadBookmarkFileMutation.mutateAsync,
    isImporting: uploadBookmarkFileMutation.isPending,
  };
}
