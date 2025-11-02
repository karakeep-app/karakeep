import { api } from "../trpc";

export function useCreateHighlight(
  ...opts: Parameters<typeof api.highlights.create.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.highlights.create.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.highlights.getForBookmark.invalidate({
        bookmarkId: req.bookmarkId,
      });
      apiUtils.highlights.getAll.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}

export function useUpdateHighlight(
  ...opts: Parameters<typeof api.highlights.update.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.highlights.update.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.highlights.getForBookmark.invalidate({
        bookmarkId: res.bookmarkId,
      });
      apiUtils.highlights.getAll.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}

export function useDeleteHighlight(
  ...opts: Parameters<typeof api.highlights.delete.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.highlights.delete.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta, context) => {
      apiUtils.highlights.getForBookmark.invalidate({
        bookmarkId: res.bookmarkId,
      });
      apiUtils.highlights.getAll.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta, context);
    },
  });
}
