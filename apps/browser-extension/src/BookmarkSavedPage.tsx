import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRightFromSquare, Trash } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useDeleteBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import BookmarkLists from "./components/BookmarkLists";
import { ListsSelector } from "./components/ListsSelector";
import { NoteEditor } from "./components/NoteEditor";
import TagList from "./components/TagList";
import { TagsSelector } from "./components/TagsSelector";
import { Button, buttonVariants } from "./components/ui/button";
import Spinner from "./Spinner";
import { cn } from "./utils/css";
import usePluginSettings from "./utils/settings";
import { MessageType } from "./utils/type";
import { useTRPC } from "./utils/trpc";

export default function BookmarkSavedPage() {
  const { bookmarkId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const api = useTRPC();
  const bookmark = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId: bookmarkId ?? "" },
      {
        enabled: !!bookmarkId,
        staleTime: 0,
        refetchOnMount: "always",
        retry: false,
      },
    ),
  );

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

  if (!bookmarkId) {
    return <div>NOT FOUND</div>;
  }

  if (bookmark.isPending) {
    return (
      <div role="status">
        Loading bookmark... <Spinner />
      </div>
    );
  }
  const errorCode = bookmark.error?.data?.code;
  const blockEditors =
    !bookmark.data ||
    errorCode === "UNAUTHORIZED" ||
    errorCode === "FORBIDDEN" ||
    errorCode === "NOT_FOUND";
  const bookmarkError = bookmark.isError ? (
    <div className="flex flex-col gap-2" role="alert">
      <p className="text-red-700 dark:text-red-400">
        {blockEditors
          ? "Could not load this bookmark. It may have been deleted or you may need to sign in again."
          : "Could not refresh this bookmark. You can keep editing and try again."}
      </p>
      <Button onClick={() => bookmark.refetch()}>Try Again</Button>
      {errorCode === "UNAUTHORIZED" && <Link to="/signin">Sign in</Link>}
      {blockEditors && <Link to="/">Check current page</Link>}
    </div>
  ) : null;
  // A temporary refetch error retains data. Keep the editors and their drafts
  // mounted unless the initial load failed or the server reports lost access.
  if (bookmark.isError && blockEditors) return bookmarkError;

  return (
    <div className="flex flex-col gap-2">
      {bookmarkError}
      {error && <p className="text-red-700 dark:text-red-400">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xl">Hoarded!</p>
        <div className="flex gap-2">
          <Link
            className={cn(
              buttonVariants({ variant: "link" }),
              "flex gap-2 rounded-md p-3",
            )}
            target="_blank"
            rel="noreferrer"
            to={`${settings.address}/dashboard/preview/${bookmarkId}`}
          >
            <ArrowUpRightFromSquare className="my-auto" size="20" />
            <p className="my-auto">Open</p>
          </Link>
          <Button
            variant="link"
            onClick={() => deleteBookmark({ bookmarkId })}
            className="flex gap-2 text-red-500 hover:text-red-500"
          >
            {!isPending ? (
              <>
                <Trash className="my-auto" size="20" />
                <p className="my-auto">Delete</p>
              </>
            ) : (
              <span className="m-auto">
                <Spinner />
              </span>
            )}
          </Button>
        </div>
      </div>
      <hr />
      <p className="text-lg">Notes</p>
      <NoteEditor bookmarkId={bookmarkId} />
      <hr />
      <p className="text-lg">Tags</p>
      <TagList bookmarkId={bookmarkId} />
      <TagsSelector bookmarkId={bookmarkId} />
      <hr />
      <p className="text-lg">Lists</p>
      <BookmarkLists bookmarkId={bookmarkId} />
      <ListsSelector bookmarkId={bookmarkId} />
    </div>
  );
}
