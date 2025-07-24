"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import FilePickerButton from "@/components/ui/file-picker-button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";

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

import { Card, CardContent } from "../ui/card";

function ImportCard({
  text,
  description,
  children,
}: {
  text: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-full bg-primary/10 p-2">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium">{text}</h3>
          <p>{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ExportButton() {
  const { t } = useTranslation();
  const [format, setFormat] = useState<"json" | "netscape">("json");

  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-full bg-primary/10 p-2">
          <Upload className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium">Export File</h3>
          <p>{t("settings.import.export_links_and_notes")}</p>
          <Select
            value={format}
            onValueChange={(value) => setFormat(value as "json" | "netscape")}
          >
            <SelectTrigger className="mt-2 w-[180px]">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON (Karakeep format)</SelectItem>
              <SelectItem value="netscape">HTML (Netscape format)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Link
          href={`/api/bookmarks/export?format=${format}`}
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "flex items-center gap-2",
          )}
        >
          <p>Export</p>
        </Link>
      </CardContent>
    </Card>
  );
}

export function ImportExportRow() {
  const { t } = useTranslation();
  const router = useRouter();

  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

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
        // This is important to avoid blocking the crawling of more important bookmarks
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
        // Add to import list
        ...toImport.listIds.map((listId) =>
          addToList({
            bookmarkId: created.id,
            listId,
          }),
        ),
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
      source:
        | "html"
        | "pocket"
        | "omnivore"
        | "karakeep"
        | "linkwarden"
        | "tab-session-manager";
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

      // Precreate folder lists
      const allRequiredPaths = new Set<string>();
      // collect the paths of all bookmarks that have non-empty paths
      for (const bookmark of finalBookmarksToImport) {
        for (const path of bookmark.paths) {
          if (path && path.length > 0) {
            // We need every prefix of the path for the hierarchy
            for (let i = 1; i <= path.length; i++) {
              const subPath = path.slice(0, i);
              const pathKey = subPath.join("/");
              allRequiredPaths.add(pathKey);
            }
          }
        }
      }

      // Convert to array and sort by depth (so that parent paths come first)
      const allRequiredPathsArray = Array.from(allRequiredPaths).sort(
        (a, b) => a.split("/").length - b.split("/").length,
      );

      const pathMap: Record<string, string> = {};

      // Root list is the parent for top-level folders
      // Represent root as empty string
      pathMap[""] = rootList.id;

      for (const pathKey of allRequiredPathsArray) {
        const parts = pathKey.split("/");
        const parentKey = parts.slice(0, -1).join("/");
        const parentId = pathMap[parentKey] || rootList.id;

        const folderName = parts[parts.length - 1];
        // Create the list
        const folderList = await createList({
          name: folderName,
          parentId: parentId,
          icon: "📁",
        });
        pathMap[pathKey] = folderList.id;
      }

      const importPromises = finalBookmarksToImport.map(
        (bookmark) => async () => {
          // Determine the target list ids
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
      setImportProgress(null); // Clear progress on initial parsing error
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 md:grid-cols-2">
        <ImportCard
          text="HTML File"
          description={t("settings.import.import_bookmarks_from_html_file")}
        >
          <FilePickerButton
            size={"sm"}
            loading={false}
            accept=".html"
            multiple={false}
            className="flex items-center gap-2"
            onFileSelect={(file) =>
              runUploadBookmarkFile({ file, source: "html" })
            }
          >
            <p>Import</p>
          </FilePickerButton>
        </ImportCard>
        <ImportCard
          text="Pocket"
          description={t("settings.import.import_bookmarks_from_pocket_export")}
        >
          <FilePickerButton
            size={"sm"}
            loading={false}
            accept=".csv"
            multiple={false}
            className="flex items-center gap-2"
            onFileSelect={(file) =>
              runUploadBookmarkFile({ file, source: "pocket" })
            }
          >
            <p>Import</p>
          </FilePickerButton>
        </ImportCard>
        <ImportCard
          text="Omnivore"
          description={t(
            "settings.import.import_bookmarks_from_omnivore_export",
          )}
        >
          <FilePickerButton
            size={"sm"}
            loading={false}
            accept=".json"
            multiple={false}
            className="flex items-center gap-2"
            onFileSelect={(file) =>
              runUploadBookmarkFile({ file, source: "omnivore" })
            }
          >
            <p>Import</p>
          </FilePickerButton>
        </ImportCard>
        <ImportCard
          text="Linkwarden"
          description={t(
            "settings.import.import_bookmarks_from_linkwarden_export",
          )}
        >
          <FilePickerButton
            size={"sm"}
            loading={false}
            accept=".json"
            multiple={false}
            className="flex items-center gap-2"
            onFileSelect={(file) =>
              runUploadBookmarkFile({ file, source: "linkwarden" })
            }
          >
            <p>Import</p>
          </FilePickerButton>
        </ImportCard>
        <ImportCard
          text="Tab Session Manager"
          description={t(
            "settings.import.import_bookmarks_from_tab_session_manager_export",
          )}
        >
          <FilePickerButton
            size={"sm"}
            loading={false}
            accept=".json"
            multiple={false}
            className="flex items-center gap-2"
            onFileSelect={(file) =>
              runUploadBookmarkFile({ file, source: "tab-session-manager" })
            }
          >
            <p>Import</p>
          </FilePickerButton>
        </ImportCard>
        <ImportCard
          text="Karakeep"
          description={t(
            "settings.import.import_bookmarks_from_karakeep_export",
          )}
        >
          <FilePickerButton
            size={"sm"}
            loading={false}
            accept=".json"
            multiple={false}
            className="flex items-center gap-2"
            onFileSelect={(file) =>
              runUploadBookmarkFile({ file, source: "karakeep" })
            }
          >
            <p>Import</p>
          </FilePickerButton>
        </ImportCard>
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
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-col gap-2">
      <p className="mb-4 text-lg font-medium">
        {t("settings.import.import_export_bookmarks")}
      </p>
      <ImportExportRow />
    </div>
  );
}
