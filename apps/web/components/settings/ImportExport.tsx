"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useBookmarkImport } from "@/lib/hooks/useBookmarkImport";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AlertCircle, Download, ListFilter, Upload } from "lucide-react";

import type { ImportSource } from "@karakeep/shared/import-export";
import { parseImportFile } from "@karakeep/shared/import-export";

import { Label } from "../ui/label";
import { ImportSessionsSection } from "./ImportSessionsSection";
import {
  SettingsFormFooter,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "./SettingsPage";

const IMPORT_HELP_URL = "https://docs.karakeep.com/using-karakeep/import";

const IMPORT_PROVIDERS: {
  source: ImportSource;
  /** Names of other products, these aren't translated. */
  name: string;
  accept: string;
}[] = [
  { source: "html", name: "HTML", accept: ".html" },
  { source: "karakeep", name: "Karakeep", accept: ".json" },
  { source: "instapaper", name: "Instapaper", accept: ".csv" },
  { source: "linkwarden", name: "Linkwarden", accept: ".json" },
  { source: "matter", name: "Matter", accept: ".csv" },
  { source: "mymind", name: "mymind", accept: ".csv" },
  { source: "omnivore", name: "Omnivore", accept: ".json" },
  { source: "onetab", name: "OneTab", accept: ".txt" },
  { source: "pocket", name: "Pocket", accept: ".csv" },
  { source: "readwise-reader", name: "Readwise Reader", accept: ".csv" },
  {
    source: "tab-session-manager",
    name: "Tab Session Manager",
    accept: ".json",
  },
];

function ExportSection() {
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
    <SettingsSection
      title={t("settings.import.export_title")}
      description={t("settings.import.export_links_and_notes")}
    >
      <SettingsRow
        label={
          <Label htmlFor="export-format">
            {t("settings.import.export_format")}
          </Label>
        }
      >
        <Select
          value={format}
          onValueChange={(value) => setFormat(value as "json" | "netscape")}
        >
          <SelectTrigger id="export-format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json">
              {t("settings.import.export_format_json")}
            </SelectItem>
            <SelectItem value="netscape">
              {t("settings.import.export_format_netscape")}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsFormFooter>
        <ActionButton
          variant="outline"
          onClick={onExport}
          loading={isFetching}
          ignoreDemoMode
        >
          <Download className="size-4" />
          {t("settings.import.export_action")}
        </ActionButton>
      </SettingsFormFooter>
    </SettingsSection>
  );
}

function ImportProviderRow({
  name,
  accept,
  isFileInvalid,
  onFileSelect,
}: {
  name: string;
  accept: string;
  isFileInvalid: boolean;
  onFileSelect: (file: File) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <li>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={t("settings.import.import_from", { name })}
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-md border px-3 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isFileInvalid && "border-destructive",
        )}
      >
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{accept}</span>
        <Upload className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {isFileInvalid && (
        <div role="alert" className="mt-2 space-y-0.5 px-1 text-sm">
          <p className="flex items-start gap-2 font-medium text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {t("settings.import.invalid_file", { name })}
          </p>
          <p className="pl-6 text-muted-foreground">
            {t("settings.import.invalid_file_expected", { format: accept })}{" "}
            <a
              href={IMPORT_HELP_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {t("settings.import.invalid_file_help")}
            </a>
          </p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFileSelect(file);
          }
          // So that picking the same file again still fires a change.
          event.target.value = "";
        }}
      />
    </li>
  );
}

function ImportSection() {
  const { t } = useTranslation();
  const { importProgress, quotaError, runUploadBookmarkFile } =
    useBookmarkImport();
  const [search, setSearch] = useState("");
  const [invalidSource, setInvalidSource] = useState<ImportSource | null>(null);

  const onFileSelect = async (file: File, source: ImportSource) => {
    setInvalidSource(null);
    // Checked here so a wrong file gets an explanation next to its source. The
    // parser's own message is about the syntax of the file.
    let parsed;
    try {
      parsed = parseImportFile(source, await file.text());
    } catch {
      setInvalidSource(source);
      return;
    }
    // Any other failure has already been reported by the hook.
    runUploadBookmarkFile({ file, source, parsed }).catch(() => undefined);
  };

  const providers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return IMPORT_PROVIDERS.map((provider) => ({
      ...provider,
      // Not a product's name, so this one does get translated.
      name:
        provider.source === "html"
          ? t("settings.import.browser_bookmarks_html")
          : provider.name,
    })).filter((provider) => provider.name.toLowerCase().includes(query));
  }, [search, t]);

  return (
    <SettingsSection
      title={t("settings.import.import_title")}
      description={t("settings.import.import_description")}
    >
      {quotaError && (
        <Alert variant="destructive" className="relative">
          <AlertCircle className="size-4" />
          <AlertTitle>{t("settings.import.quota_exceeded")}</AlertTitle>
          <AlertDescription>{quotaError}</AlertDescription>
        </Alert>
      )}
      <Input
        type="search"
        variant="filled"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("settings.import.search_placeholder")}
        aria-label={t("settings.import.search_placeholder")}
        startIcon={<ListFilter className="size-4 text-muted-foreground" />}
        autoComplete="off"
      />
      {providers.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {providers.map((provider) => (
            <ImportProviderRow
              key={provider.source}
              name={provider.name}
              accept={provider.accept}
              isFileInvalid={invalidSource === provider.source}
              onFileSelect={(file) => onFileSelect(file, provider.source)}
            />
          ))}
        </ul>
      ) : (
        <Empty className="p-4 md:p-6">
          <EmptyHeader>
            <EmptyTitle className="text-base">
              {t("settings.import.no_providers")}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {Object.entries(importProgress).map(([id, progress]) => {
        return (
          <div key={id} className="flex flex-col gap-2">
            <p className="shrink-0 text-sm">
              {t("settings.import.progress", {
                done: progress.done,
                total: progress.total,
              })}
            </p>
            <div className="w-full">
              <Progress value={(progress.done * 100) / progress.total} />
            </div>
          </div>
        );
      })}
    </SettingsSection>
  );
}

export default function ImportExport() {
  const { t } = useTranslation();
  return (
    <SettingsPage
      title={t("settings.import.import_export")}
      description={t("settings.import.page_description")}
    >
      <ExportSection />
      <ImportSection />
      <ImportSessionsSection />
    </SettingsPage>
  );
}
