import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "../trpc";

// Mutation success also invalidates history queries. Relationship operations
// can affect multiple bookmarks, so invalidation covers cached history streams
// rather than assuming that the currently open preview is the only affected item.
type TRPCApi = ReturnType<typeof useTRPC>;

export function useAttachBookmarkAsset(
  opts?: Parameters<TRPCApi["assets"]["attachAsset"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.assets.attachAsset.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        void queryClient.invalidateQueries(
          api.bookmarks.getHistory.pathFilter(),
        );
        void queryClient.invalidateQueries(
          api.bookmarks.getDeletedHistory.pathFilter(),
        );
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: req.bookmarkId }),
        );
        queryClient.invalidateQueries(api.assets.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useReplaceBookmarkAsset(
  opts?: Parameters<TRPCApi["assets"]["replaceAsset"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.assets.replaceAsset.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        void queryClient.invalidateQueries(
          api.bookmarks.getHistory.pathFilter(),
        );
        void queryClient.invalidateQueries(
          api.bookmarks.getDeletedHistory.pathFilter(),
        );
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: req.bookmarkId }),
        );
        queryClient.invalidateQueries(api.assets.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDetachBookmarkAsset(
  opts?: Parameters<TRPCApi["assets"]["detachAsset"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.assets.detachAsset.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        void queryClient.invalidateQueries(
          api.bookmarks.getHistory.pathFilter(),
        );
        void queryClient.invalidateQueries(
          api.bookmarks.getDeletedHistory.pathFilter(),
        );
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId: req.bookmarkId }),
        );
        queryClient.invalidateQueries(api.assets.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}
