import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";

import { api } from "../trpc";
import { useBookmarkGridContext } from "./bookmark-grid-context";
import { useAddBookmarkToList } from "./lists";

export function useAutoRefreshingBookmarkQuery(
  input: Parameters<typeof api.bookmarks.getBookmark.useQuery>[0],
) {
  return api.bookmarks.getBookmark.useQuery(input, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) {
        return false;
      }
      return getBookmarkRefreshInterval(data);
    },
  });
}

export function useCreateBookmark(
  ...opts: Parameters<typeof api.bookmarks.createBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.createBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.lists.stats.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useCreateBookmarkWithPostHook(
  ...opts: Parameters<typeof api.bookmarks.createBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  const postCreationCB = useBookmarkPostCreationHook();
  return api.bookmarks.createBookmark.useMutation({
    ...opts[0],
    onSuccess: async (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      await postCreationCB(res.id);
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useDeleteBookmark(
  ...opts: Parameters<typeof api.bookmarks.deleteBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.deleteBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      apiUtils.lists.stats.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useUpdateBookmark(
  ...opts: Parameters<typeof api.bookmarks.updateBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.updateBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      apiUtils.lists.stats.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useSummarizeBookmark(
  ...opts: Parameters<typeof api.bookmarks.summarizeBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.summarizeBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useRecrawlBookmark(
  ...opts: Parameters<typeof api.bookmarks.recrawlBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.recrawlBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useUpdateBookmarkTags(
  ...opts: Parameters<typeof api.bookmarks.updateTags.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.updateTags.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });

      [...res.attached, ...res.detached].forEach((id) => {
        apiUtils.tags.get.invalidate({ tagId: id });
        apiUtils.bookmarks.getBookmarks.invalidate({ tagId: id });
      });
      apiUtils.tags.list.invalidate();
      apiUtils.lists.stats.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

/**
 * Checks the grid query context to know if we need to augment the bookmark post creation to fit the grid context
 */
export function useBookmarkPostCreationHook() {
  const gridQueryCtx = useBookmarkGridContext();
  const { mutateAsync: updateBookmark } = useUpdateBookmark();
  const { mutateAsync: addToList } = useAddBookmarkToList();
  const { mutateAsync: updateTags } = useUpdateBookmarkTags();

  return async (bookmarkId: string) => {
    if (!gridQueryCtx) {
      return;
    }

    const promises = [];
    if (gridQueryCtx.favourited ?? gridQueryCtx.archived) {
      promises.push(
        updateBookmark({
          bookmarkId,
          favourited: gridQueryCtx.favourited,
          archived: gridQueryCtx.archived,
        }),
      );
    }

    if (gridQueryCtx.listId) {
      promises.push(
        addToList({
          bookmarkId,
          listId: gridQueryCtx.listId,
        }),
      );
    }

    if (gridQueryCtx.tagId) {
      promises.push(
        updateTags({
          bookmarkId,
          attach: [{ tagId: gridQueryCtx.tagId }],
          detach: [],
        }),
      );
    }

    return Promise.all(promises);
  };
}
