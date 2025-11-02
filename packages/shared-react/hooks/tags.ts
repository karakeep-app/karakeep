import { keepPreviousData } from "@tanstack/react-query";

import { ZTagListResponse } from "@karakeep/shared/types/tags";

import { api } from "../trpc";

export function usePaginatedSearchTags(
  input: Parameters<typeof api.tags.list.useInfiniteQuery>[0],
) {
  return api.tags.list.useInfiniteQuery(input, {
    placeholderData: keepPreviousData,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => ({
      tags: data.pages.flatMap((page) => page.tags),
    }),
    gcTime: 60_000,
  });
}

export function useTagAutocomplete<T>(opts: {
  nameContains: string;
  select?: (tags: ZTagListResponse) => T;
}) {
  return api.tags.list.useQuery(
    {
      nameContains: opts.nameContains,
      limit: 50,
      sortBy: opts.nameContains ? "relevance" : "usage",
    },
    {
      select: opts.select,
      placeholderData: keepPreviousData,
      gcTime: opts.nameContains?.length > 0 ? 60_000 : 3_600_000,
    },
  );
}

export function useCreateTag(
  ...opts: Parameters<typeof api.tags.create.useMutation>
) {
  const apiUtils = api.useUtils();

  return api.tags.create.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.tags.list.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useUpdateTag(
  ...opts: Parameters<typeof api.tags.update.useMutation>
) {
  const apiUtils = api.useUtils();

  return api.tags.update.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.tags.list.invalidate();
      apiUtils.tags.get.invalidate({ tagId: res.id });
      apiUtils.bookmarks.getBookmarks.invalidate({ tagId: res.id });

      // TODO: Maybe we can only look at the cache and invalidate only affected bookmarks
      apiUtils.bookmarks.getBookmark.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useMergeTag(
  ...opts: Parameters<typeof api.tags.merge.useMutation>
) {
  const apiUtils = api.useUtils();

  return api.tags.merge.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.tags.list.invalidate();
      [res.mergedIntoTagId, ...res.deletedTags].forEach((tagId) => {
        apiUtils.tags.get.invalidate({ tagId });
        apiUtils.bookmarks.getBookmarks.invalidate({ tagId });
      });
      // TODO: Maybe we can only look at the cache and invalidate only affected bookmarks
      apiUtils.bookmarks.getBookmark.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useDeleteTag(
  ...opts: Parameters<typeof api.tags.delete.useMutation>
) {
  const apiUtils = api.useUtils();

  return api.tags.delete.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.tags.list.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useDeleteUnusedTags(
  ...opts: Parameters<typeof api.tags.deleteUnused.useMutation>
) {
  const apiUtils = api.useUtils();

  return api.tags.deleteUnused.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.tags.list.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}
