"use client";

import { toast } from "@/components/ui/sonner";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

export function useCreateImportSession() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.importSessions.createImportSession.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          api.importSessions.listImportSessions.pathFilter(),
        );
      },
      onError: (error) => {
        toast({
          description: error.message || "Failed to create import session",
          variant: "destructive",
        });
      },
    }),
  );
}

export function useListImportSessions() {
  const api = useTRPC();
  return useQuery(
    api.importSessions.listImportSessions.queryOptions(
      {},
      {
        select: (data) => data.sessions,
      },
    ),
  );
}

export function useImportSessionStats(importSessionId: string) {
  const api = useTRPC();
  return useQuery(
    api.importSessions.getImportSessionStats.queryOptions(
      {
        importSessionId,
      },
      {
        refetchInterval: (q) =>
          !q.state.data ||
          !["completed", "failed"].includes(q.state.data.status)
            ? 5000
            : false, // Refetch every 5 seconds to show progress
        enabled: !!importSessionId,
      },
    ),
  );
}

export function useDeleteImportSession() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.importSessions.deleteImportSession.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          api.importSessions.listImportSessions.pathFilter(),
        );
        toast({
          description: "Import session deleted successfully",
          variant: "default",
        });
      },
      onError: (error) => {
        toast({
          description: error.message || "Failed to delete import session",
          variant: "destructive",
        });
      },
    }),
  );
}

export function usePauseImportSession() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.importSessions.pauseImportSession.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          api.importSessions.listImportSessions.pathFilter(),
        );
        toast({
          description: "Import session paused",
          variant: "default",
        });
      },
      onError: (error) => {
        toast({
          description: error.message || "Failed to pause import session",
          variant: "destructive",
        });
      },
    }),
  );
}

export function useResumeImportSession() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.importSessions.resumeImportSession.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          api.importSessions.listImportSessions.pathFilter(),
        );
        toast({
          description: "Import session resumed",
          variant: "default",
        });
      },
      onError: (error) => {
        toast({
          description: error.message || "Failed to resume import session",
          variant: "destructive",
        });
      },
    }),
  );
}

export function useImportSessionResults(
  importSessionId: string,
  filter: "all" | "accepted" | "rejected" | "skipped_duplicate" | "pending",
) {
  const api = useTRPC();
  return useInfiniteQuery(
    api.importSessions.getImportSessionResults.infiniteQueryOptions(
      { importSessionId, filter, limit: 50 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  );
}
