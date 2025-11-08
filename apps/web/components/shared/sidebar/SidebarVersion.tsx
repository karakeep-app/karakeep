"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { z } from "zod";

const GITHUB_OWNER_REPO = "karakeep-app/karakeep";
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER_REPO}`;
const GITHUB_RELEASE_URL = `${GITHUB_REPO_URL}/releases/tag/`;
const RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_OWNER_REPO}/releases/tags/`;
const LOCAL_STORAGE_KEY = "karakeep:whats-new:last-seen-version";
const RELEASE_NOTES_STALE_TIME = 1000 * 60 * 10; // 10 minutes

const zGitHubReleaseSchema = z.object({
  body: z.string().optional(),
  tag_name: z.string(),
  name: z.string(),
});

function isStableRelease(version?: string) {
  if (!version) {
    return false;
  }
  const normalized = version.toLowerCase();
  if (
    normalized.includes("nightly") ||
    normalized.includes("beta") ||
    normalized.includes("0.0.1")
  ) {
    return false;
  }
  return true;
}

interface SidebarVersionProps {
  serverVersion?: string;
}

export default function SidebarVersion({ serverVersion }: SidebarVersionProps) {
  const { disableNewReleaseCheck } = useClientConfig();
  const { t } = useTranslation();

  const stableRelease = isStableRelease(serverVersion);
  const displayVersion = serverVersion ?? "unknown";
  const versionLabel = `Karakeep v${displayVersion}`;
  const releasePageUrl = useMemo(() => {
    if (!serverVersion || !isStableRelease(serverVersion)) {
      return GITHUB_REPO_URL;
    }
    return `${GITHUB_RELEASE_URL}v${serverVersion}`;
  }, [serverVersion]);

  const [open, setOpen] = useState(false);
  const [shouldNotify, setShouldNotify] = useState(false);

  const releaseNotesQuery = useQuery<string>({
    queryKey: ["sidebar-release-notes", serverVersion],
    queryFn: async ({ signal }) => {
      if (!serverVersion) {
        return "";
      }

      const response = await fetch(`${RELEASE_API_URL}v${serverVersion}`, {
        signal,
      });

      if (!response.ok) {
        throw new Error("Failed to load release notes");
      }

      const json = await response.json();
      const data = zGitHubReleaseSchema.parse(json);
      return data.body ?? "";
    },
    enabled:
      open &&
      stableRelease &&
      !disableNewReleaseCheck &&
      Boolean(serverVersion),
    staleTime: RELEASE_NOTES_STALE_TIME,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const isLoadingReleaseNotes =
    releaseNotesQuery.isLoading && !releaseNotesQuery.data;

  const releaseNotesErrorMessage = useMemo(() => {
    const queryError = releaseNotesQuery.error;
    if (!queryError) {
      return null;
    }

    const errorName =
      queryError instanceof Error
        ? queryError.name
        : typeof (queryError as { name?: unknown })?.name === "string"
          ? String((queryError as { name?: unknown }).name)
          : undefined;

    if (
      errorName === "AbortError" ||
      errorName === "CanceledError" ||
      errorName === "CancelledError"
    ) {
      return null;
    }

    return t("version.unable_to_load_release_notes");
  }, [releaseNotesQuery.error, t]);

  useEffect(() => {
    if (!stableRelease || !serverVersion || disableNewReleaseCheck) {
      setShouldNotify(false);
      return;
    }

    try {
      const seenVersion = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      setShouldNotify(seenVersion !== serverVersion);
    } catch (error) {
      console.warn("Failed to read localStorage:", error);
      setShouldNotify(true);
    }
  }, [serverVersion, stableRelease, disableNewReleaseCheck]);

  const markReleaseAsSeen = useCallback(() => {
    if (!serverVersion) return;
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, serverVersion);
    } catch (error) {
      console.warn("Failed to write to localStorage:", error);
      // Ignore failures, we still clear the notification for the session
    }
    setShouldNotify(false);
  }, [serverVersion]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen((prev) => {
        if (prev && !nextOpen) {
          markReleaseAsSeen();
        }
        return nextOpen;
      });
    },
    [markReleaseAsSeen],
  );

  if (!stableRelease || disableNewReleaseCheck) {
    return (
      <Link
        href={releasePageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto flex items-center border-t pt-2 text-sm text-gray-400 hover:underline"
      >
        {versionLabel}
      </Link>
    );
  }

  return (
    <>
      <div className="mt-auto border-t pt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={
            shouldNotify ? t("version.new_release_available") : undefined
          }
          className="flex w-full items-center justify-between text-left text-sm text-gray-400 transition hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span aria-hidden={shouldNotify}>{versionLabel}</span>
          {shouldNotify && (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              <span className="sr-only">
                {t("version.new_release_available")}
              </span>
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
            </span>
          )}
        </button>
      </div>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {t("version.whats_new_title", { version: displayVersion })}
            </DialogTitle>
            <DialogDescription>
              {t("version.release_notes_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            {isLoadingReleaseNotes ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                <span>{t("version.loading_release_notes")}</span>
              </div>
            ) : releaseNotesErrorMessage ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="size-4" aria-hidden="true" />
                <span>{releaseNotesErrorMessage}</span>
              </div>
            ) : releaseNotesQuery.data !== undefined ? (
              releaseNotesQuery.data.trim() ? (
                <MarkdownReadonly className="prose-sm">
                  {releaseNotesQuery.data}
                </MarkdownReadonly>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("version.no_release_notes")}
                </p>
              )
            ) : null}
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{t("version.release_notes_synced")}</span>
            <Button asChild variant="link" size="sm" className="px-0">
              <Link
                href={releasePageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("version.view_on_github")}
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
