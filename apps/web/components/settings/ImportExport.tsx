"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import FilePickerButton from "@/components/ui/file-picker-button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBookmarkImport } from "@/lib/hooks/useBookmarkImport";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload } from "lucide-react";

import { Card, CardContent } from "../ui/card";
import { toast } from "../ui/use-toast";
import { ImportSessionsSection } from "./ImportSessionsSection";

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
  const queryClient = useQueryClient();
  const { isFetching, refetch, error } = useQuery({
    queryKey: ["exportBookmarks"],
    queryFn: async () => {
      const res = await fetch(`/api/bookmarks/export?format=${format}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error?.error || "Failed to export bookmarks");
      }
      const match = res.headers
        .get("Content-Disposition")
        ?.match(/filename\*?=(?:UTF-8''|")?([^"]+)/i);
      const filename = match
        ? match[1]
        : `karakeep-export-${new Date().toISOString()}.${format}`;
      return { blob: res.blob(), filename };
    },
    enabled: false,
  });

  useEffect(() => {
    if (error) {
      toast({
        description: error.message,
        variant: "destructive",
      });
    }
  }, [error]);

  const onExport = useCallback(async () => {
    const { data } = await refetch();
    if (!data) return;
    const { blob, filename } = data;
    const url = window.URL.createObjectURL(await blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    queryClient.setQueryData(["exportBookmarks"], () => null);
  }, [refetch]);

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
        <Button
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "flex items-center gap-2",
          )}
          onClick={onExport}
          disabled={isFetching}
        >
          {isFetching && <Loader2 className="mr-2 animate-spin" />}
          <p>Export</p>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ImportExportRow() {
  const { t } = useTranslation();
  const { importProgress, runUploadBookmarkFile } = useBookmarkImport();

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
    <div className="space-y-3">
      <div className="rounded-md border bg-background p-4">
        <div className="flex w-full flex-col gap-6">
          <div>
            <p className="mb-4 text-lg font-medium">
              {t("settings.import.import_export_bookmarks")}
            </p>
            <ImportExportRow />
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-background p-4">
        <ImportSessionsSection />
      </div>
    </div>
  );
}
