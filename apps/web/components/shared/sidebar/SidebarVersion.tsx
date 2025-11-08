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
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";

const GITHUB_OWNER_REPO = "karakeep-app/karakeep";
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER_REPO}`;
const GITHUB_RELEASE_URL = `${GITHUB_REPO_URL}/releases/tag/`;
const RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_OWNER_REPO}/releases/tags/`;
const LOCAL_STORAGE_KEY = "karakeep:whats-new:last-seen-version";

function isStableRelease(version?: string) {
  if (!version) return false;
  const normalized = version.toLowerCase();
  if (normalized.includes("nightly")) return false;
  return !normalized.includes("-");
}

interface SidebarVersionProps {
  serverVersion?: string;
}

export default function SidebarVersion({ serverVersion }: SidebarVersionProps) {
  const { disableNewReleaseCheck } = useClientConfig();

  const stableRelease = isStableRelease(serverVersion);
  const displayVersion = serverVersion ?? "unknown";
  const releasePageUrl = useMemo(() => {
    if (!serverVersion) return GITHUB_REPO_URL;
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

      const data = (await response.json()) as { body?: string };
      return data.body ?? "";
    },
    enabled:
      open &&
      stableRelease &&
      !disableNewReleaseCheck &&
      Boolean(serverVersion),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const isLoadingReleaseNotes =
    releaseNotesQuery.isFetching && !releaseNotesQuery.data;

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

    return "Unable to load release notes right now. Please try again later.";
  }, [releaseNotesQuery.error]);

  useEffect(() => {
    if (!stableRelease || !serverVersion || disableNewReleaseCheck) {
      setShouldNotify(false);
      return;
    }

    try {
      const seenVersion = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      setShouldNotify(seenVersion !== serverVersion);
    } catch {
      setShouldNotify(true);
    }
  }, [serverVersion, stableRelease, disableNewReleaseCheck]);

  const markReleaseAsSeen = useCallback(() => {
    if (!serverVersion) return;
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, serverVersion);
    } catch {
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
        Karakeep v{displayVersion}
      </Link>
    );
  }

  return (
    <>
      <div className="mt-auto border-t pt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between text-left text-sm text-gray-400 transition hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>Karakeep v{displayVersion}</span>
          {shouldNotify && (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              <span className="sr-only">New release notes available</span>
              What&apos;s new
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
            <DialogTitle>What&apos;s new in v{displayVersion}</DialogTitle>
            <DialogDescription>
              Here are the latest updates fetched from the GitHub release notes.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            {isLoadingReleaseNotes ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                <span>Loading release notes…</span>
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
                  No release notes were published for this version.
                </p>
              )
            ) : null}
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Release notes are synced from GitHub.</span>
            <Button asChild variant="link" size="sm" className="px-0">
              <Link
                href={releasePageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
