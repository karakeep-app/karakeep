import { api } from "../trpc";

export function useAttachBookmarkAsset(
  ...opts: Parameters<typeof api.assets.attachAsset.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.assets.attachAsset.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      apiUtils.assets.list.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}

export function useReplaceBookmarkAsset(
  ...opts: Parameters<typeof api.assets.replaceAsset.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.assets.replaceAsset.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      apiUtils.assets.list.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}

export function useDetachBookmarkAsset(
  ...opts: Parameters<typeof api.assets.detachAsset.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.assets.detachAsset.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      apiUtils.assets.list.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}
