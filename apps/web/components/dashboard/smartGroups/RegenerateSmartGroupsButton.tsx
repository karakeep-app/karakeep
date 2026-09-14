"use client";

import { ActionButton } from "@/components/ui/action-button";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

export function RegenerateSmartGroupsButton() {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { mutate: regenerate, isPending } = useMutation(
    api.smartGroups.regenerateNow.mutationOptions({
      onSuccess: () => {
        toast({ description: t("smart_groups.regenerate_enqueued") });
      },
      onError: (error) => {
        toast({
          description: `Error: ${error.message}`,
          variant: "destructive",
        });
      },
      onSettled: () => {
        queryClient.invalidateQueries(api.smartGroups.list.pathFilter());
      },
    }),
  );

  return (
    <ActionButton
      loading={isPending}
      variant="outline"
      className="gap-2"
      onClick={() => regenerate()}
    >
      <RefreshCw className="size-4" />
      {t("smart_groups.regenerate_now")}
    </ActionButton>
  );
}
