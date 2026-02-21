import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "../trpc";

type TRPCApi = ReturnType<typeof useTRPC>;

export function useCreateHighlight(
  opts?: Parameters<TRPCApi["highlights"]["create"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.highlights.create.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.highlights.getForBookmark.queryFilter({
            bookmarkId: req.bookmarkId,
          }),
        );
        queryClient.invalidateQueries(api.highlights.getAll.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useUpdateHighlight(
  opts?: Parameters<TRPCApi["highlights"]["update"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.highlights.update.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.highlights.getForBookmark.queryFilter({
            bookmarkId: res.bookmarkId,
          }),
        );
        queryClient.invalidateQueries(api.highlights.getAll.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}

export function useDeleteHighlight(
  opts?: Parameters<TRPCApi["highlights"]["delete"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    api.highlights.delete.mutationOptions({
      ...opts,
      onSuccess: (res, req, meta, context) => {
        queryClient.invalidateQueries(
          api.highlights.getForBookmark.queryFilter({
            bookmarkId: res.bookmarkId,
          }),
        );
        queryClient.invalidateQueries(api.highlights.getAll.pathFilter());
        return opts?.onSuccess?.(res, req, meta, context);
      },
    }),
  );
}
