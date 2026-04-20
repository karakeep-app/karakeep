import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  listsToTree,
  ZBookmarkListRoot,
} from "@karakeep/shared/utils/listUtils";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

export function useCreateBookmarkList(
  opts?: Parameters<TRPCApi["lists"]["create"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.lists.create.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.lists.list.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useEditBookmarkList(
  opts?: Parameters<TRPCApi["lists"]["edit"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.lists.edit.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.lists.list.pathFilter());
        queryClient.invalidateQueries(
          api.lists.get.queryFilter({ listId: req.listId }),
        );
        if (res.type === "smart") {
          queryClient.invalidateQueries(
            api.bookmarks.getBookmarks.queryFilter({ listId: req.listId }),
          );
        }
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useMergeLists(
  opts?: Parameters<TRPCApi["lists"]["merge"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.lists.merge.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.lists.list.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.getBookmarks.queryFilter({ listId: req.targetId }),
        );
        queryClient.invalidateQueries(api.lists.stats.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useAddBookmarkToList(
  opts?: Parameters<TRPCApi["lists"]["addToList"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.lists.addToList.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.bookmarks.getBookmarks.queryFilter({ listId: req.listId }),
        );
        queryClient.invalidateQueries(
          api.lists.getListsOfBookmark.queryFilter({
            bookmarkId: req.bookmarkId,
          }),
        );
        queryClient.invalidateQueries(api.lists.stats.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useRemoveBookmarkFromList(
  opts?: Parameters<TRPCApi["lists"]["removeFromList"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.lists.removeFromList.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.bookmarks.getBookmarks.queryFilter({ listId: req.listId }),
        );
        queryClient.invalidateQueries(
          api.lists.getListsOfBookmark.queryFilter({
            bookmarkId: req.bookmarkId,
          }),
        );
        queryClient.invalidateQueries(api.lists.stats.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteBookmarkList(
  opts?: Parameters<TRPCApi["lists"]["delete"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.lists.delete.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(api.lists.list.pathFilter());
        queryClient.removeQueries(
          api.lists.get.queryFilter({ listId: req.listId }),
        );
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useBookmarkLists(
  input?: Parameters<TRPCApi["lists"]["list"]["queryOptions"]>[0],
  opts?: Parameters<TRPCApi["lists"]["list"]["queryOptions"]>[1],
) {
  const api = useTRPC();
  return useQuery(
    api.lists.list.queryOptions(input, {
      ...opts,
      select: (data) => {
        return { data: data.lists, ...listsToTree(data.lists) };
      },
    }),
  );
}

export function augmentBookmarkListsWithInitialData(
  data:
    | {
        data: ZBookmarkList[];
        root: ZBookmarkListRoot;
        allPaths: ZBookmarkList[][];
        getPathById: (id: string) => ZBookmarkList[] | undefined;
      }
    | undefined,
  initialData: ZBookmarkList[],
) {
  if (data) {
    return data;
  }
  return { data: initialData, ...listsToTree(initialData) };
}
