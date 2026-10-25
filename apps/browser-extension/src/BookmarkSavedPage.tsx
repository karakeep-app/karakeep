import { useState } from "react";
import { CircleCheck, ExternalLink, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import {
  useAutoRefreshingBookmarkQuery,
  useDeleteBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getSourceUrl } from "@karakeep/shared/utils/bookmarkUtils";

import BookmarkLists from "./components/BookmarkLists";
import { ErrorCallout } from "./components/ErrorCallout";
import { ListsSelector } from "./components/ListsSelector";
import { NoteEditor } from "./components/NoteEditor";
import TagList from "./components/TagList";
import { TagsSelector } from "./components/TagsSelector";
import { TitleEditor } from "./components/TitleEditor";
import { Button, buttonVariants } from "./components/ui/button";
import Spinner from "./Spinner";
import { cn } from "./utils/css";
import usePluginSettings from "./utils/settings";
import { MessageType } from "./utils/type";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function BookmarkSavedPage() {
  const { bookmarkId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const { mutate: deleteBookmark, isPending } = useDeleteBookmark({
    onSuccess: async () => {
      try {
        const [currentTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        await chrome.runtime.sendMessage({
          type: MessageType.BOOKMARK_REFRESH_BADGE,
          currentTab: currentTab,
        });
      } catch {
        // Badge refresh is best-effort — on Firefox Android the background
        // script may not be reachable from the popup context.
      }
      navigate("/bookmarkdeleted");
    },
    onError: (e) => {
      setError(e.message);
    },
  });

  const { settings } = usePluginSettings();
  const { data: bookmark } = useAutoRefreshingBookmarkQuery({
    bookmarkId: bookmarkId ?? "",
  });

  if (!bookmarkId) {
    return (
      <ErrorCallout title="Bookmark not found">
        This bookmark doesn&apos;t exist.
      </ErrorCallout>
    );
  }

  // The title is editable below, so the header names where it came from.
  const sourceUrl = bookmark ? getSourceUrl(bookmark) : null;
  let subtitle: string | null = null;
  if (sourceUrl) {
    try {
      subtitle = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      subtitle = sourceUrl;
    }
  } else if (bookmark?.content.type === BookmarkTypes.TEXT) {
    subtitle = bookmark.content.text;
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <ErrorCallout title="Couldn't delete bookmark">{error}</ErrorCallout>
      )}
      <div className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-500" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-base font-semibold leading-tight">Hoarded!</p>
          <p className="truncate text-xs text-muted-foreground">
            {subtitle ?? "Saved to Karakeep"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 gap-1.5 px-2.5",
            )}
            target="_blank"
            rel="noreferrer"
            href={`${settings.address}/dashboard/preview/${bookmarkId}`}
          >
            <ExternalLink className="size-3.5" />
            Open
          </a>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteBookmark({ bookmarkId })}
            disabled={isPending}
            className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete bookmark"
            title="Delete bookmark"
          >
            {isPending ? (
              <Spinner className="size-4" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
        </div>
      </div>
      <Section title="Title">
        <TitleEditor bookmarkId={bookmarkId} />
      </Section>
      <Section title="Note">
        <NoteEditor bookmarkId={bookmarkId} />
      </Section>
      <Section title="Tags">
        <div className="flex flex-wrap items-center gap-1.5">
          <TagList bookmarkId={bookmarkId} />
          <TagsSelector bookmarkId={bookmarkId} />
        </div>
      </Section>
      <Section title="Lists">
        <div className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
          {/* The picker sits above the lists so adding one doesn't push it
              (and its open dropdown) down. */}
          <ListsSelector bookmarkId={bookmarkId} />
          <BookmarkLists bookmarkId={bookmarkId} />
        </div>
      </Section>
    </div>
  );
}
