"use client";

import { toast } from "@/components/ui/use-toast";

import { api } from "@karakeep/shared-react/trpc";

export function useCreateImportSession() {
  const apiUtils = api.useUtils();

  return api.importSessions.createImportSession.useMutation({
    onSuccess: () => {
      apiUtils.importSessions.listImportSessions.invalidate();
    },
    onError: (error) => {
      toast({
        description: error.message || "Failed to create import session",
        variant: "destructive",
      });
    },
  });
}

export function useListImportSessions() {
  return api.importSessions.listImportSessions.useQuery(
    {},
    {
      select: (data) => data.sessions,
    },
  );
}

export function useImportSessionStats(importSessionId: string) {
  return api.importSessions.getImportSessionStats.useQuery(
    {
      importSessionId,
    },
    {
      refetchInterval: 5000, // Refetch every 5 seconds to show progress
      enabled: !!importSessionId,
    },
  );
}

export function useDeleteImportSession() {
  const apiUtils = api.useUtils();

  return api.importSessions.deleteImportSession.useMutation({
    onSuccess: () => {
      apiUtils.importSessions.listImportSessions.invalidate();
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
  });
}
