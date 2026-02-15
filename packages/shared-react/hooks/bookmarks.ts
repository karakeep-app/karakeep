import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";

import { useTRPC } from "../trpc";
import { useBookmarkGridContext } from "./bookmark-grid-context";
import { useAddBookmarkToList } from "./lists";

type TRPCApi = ReturnType<typeof useTRPC>;

export function useAutoRefreshingBookmarkQuery(
  input: Parameters<TRPCApi["bookmarks"]["getBookmark"]["queryOptions"]>[0],
) {
  const api = useTRPC();
  return useQuery(
    api.bookmarks.getBookmark.queryOptions(input, {
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) {
          return false;
        }
        return getBookmarkRefreshInterval(data);
      },
    }),
  );
}

export function useCreateBookmark(
  opts?: Parameters<
    TRPCApi["bookmarks"]["createBookmark"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.bookmarks.createBookmark.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        queryClient.invalidateQueries(api.lists.stats.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useCreateBookmarkWithPostHook(
  opts?: Parameters<
    TRPCApi["bookmarks"]["createBookmark"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const postCreationCB = useBookmarkPostCreationHook();
  return useMutation(
    api.bookmarks.createBookmark.mutationOptions({
      ...opts,
      onSuccess: async (res, req, meta, context) => {
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        await postCreationCB(res.id);
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteBookmark(
  opts?: Parameters<
    TRPCApi["bookmarks"]["deleteBookmark"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.bookmarks.deleteBookmark.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        queryClient.removeQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: req.bookmarkId }),
        );
        queryClient.invalidateQueries(api.lists.stats.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useUpdateBookmark(
  opts?: Parameters<
    TRPCApi["bookmarks"]["updateBookmark"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.bookmarks.updateBookmark.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: req.bookmarkId }),
        );
        queryClient.invalidateQueries(api.lists.stats.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useSummarizeBookmark(
  opts?: Parameters<
    TRPCApi["bookmarks"]["summarizeBookmark"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.bookmarks.summarizeBookmark.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: req.bookmarkId }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useRecrawlBookmark(
  opts?: Parameters<
    TRPCApi["bookmarks"]["recrawlBookmark"]["mutationOptions"]
  >[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.bookmarks.recrawlBookmark.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: req.bookmarkId }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useUpdateBookmarkTags(
  opts?: Parameters<TRPCApi["bookmarks"]["updateTags"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.bookmarks.updateTags.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: req.bookmarkId }),
        );

        [...res.attached, ...res.detached].forEach((id) => {
          queryClient.invalidateQueries(
            api.tags.get.queryFilter({ tagId: id }),
          );
          queryClient.invalidateQueries(
            api.bookmarks.getBookmarks.queryFilter({ tagId: id }),
          );
        });
        queryClient.invalidateQueries(api.tags.list.pathFilter());
        queryClient.invalidateQueries(api.lists.stats.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
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
