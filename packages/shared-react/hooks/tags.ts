import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { ZTagListResponse } from "@karakeep/shared/types/tags";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

export function usePaginatedSearchTags(
  input: Parameters<TRPCApi["tags"]["list"]["infiniteQueryOptions"]>[0],
) {
  const api = useTRPC();
  return useInfiniteQuery({
    ...api.tags.list.infiniteQueryOptions(input, {
      placeholderData: keepPreviousData,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      gcTime: 60_000,
    }),
    select: (data) => ({
      tags: data.pages.flatMap((page) => page.tags),
    }),
  });
}

export function useTagAutocomplete<T = ZTagListResponse>(opts: {
  nameContains: string;
  select?: (data: ZTagListResponse) => T;
  enabled?: boolean;
}) {
  const api = useTRPC();
  return useQuery({
    ...api.tags.list.queryOptions(
      {
        nameContains: opts.nameContains,
        limit: 50,
        sortBy: opts.nameContains ? "relevance" : "usage",
      },
      {
        placeholderData: keepPreviousData,
        gcTime: opts.nameContains?.length > 0 ? 60_000 : 3_600_000,
        enabled: opts.enabled,
      },
    ),
    select: opts.select,
  });
}

export function useCreateTag(
  opts?: Parameters<TRPCApi["tags"]["create"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.tags.create.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.tags.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useUpdateTag(
  opts?: Parameters<TRPCApi["tags"]["update"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.tags.update.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.tags.list.pathFilter());
        queryClient.invalidateQueries(
          api.tags.get.queryFilter({ tagId: res.id }),
        );
        queryClient.invalidateQueries(
          api.bookmarks.getBookmarks.queryFilter({ tagId: res.id }),
        );

        // TODO: Maybe we can only look at the cache and invalidate only affected bookmarks
        queryClient.invalidateQueries(api.bookmarks.getBookmark.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useMergeTag(
  opts?: Parameters<TRPCApi["tags"]["merge"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.tags.merge.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.tags.list.pathFilter());
        [res.mergedIntoTagId, ...res.deletedTags].forEach((tagId) => {
          queryClient.invalidateQueries(api.tags.get.queryFilter({ tagId }));
          queryClient.invalidateQueries(
            api.bookmarks.getBookmarks.queryFilter({ tagId }),
          );
        });
        // TODO: Maybe we can only look at the cache and invalidate only affected bookmarks
        queryClient.invalidateQueries(api.bookmarks.getBookmark.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteTag(
  opts?: Parameters<TRPCApi["tags"]["delete"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.tags.delete.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.tags.list.pathFilter());
        queryClient.invalidateQueries(api.bookmarks.getBookmark.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteUnusedTags(
  opts?: Parameters<TRPCApi["tags"]["deleteUnused"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.tags.deleteUnused.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.tags.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}
