"use client";

import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { Trash } from "lucide-react";

export default function DeleteApiKey({
  name,
  id,
}: {
  name: string;
  id: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const mutator = api.apiKeys.revoke.useMutation({
    onSuccess: () => {
      toast({
        description: "Key was successfully deleted",
      });
      router.refresh();
    },
  });

  return (
    <ActionConfirmingDialog
      title={"Delete API Key"}
      description={
        <p>
          Are you sure you want to delete the API key &quot;{name}&quot;? Any
          service using this API key will lose access.
        </p>
      }
      actionButton={(setDialogOpen) => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={mutator.isPending}
          onClick={() =>
            mutator.mutate({ id }, { onSuccess: () => setDialogOpen(false) })
          }
        >
          {t("actions.delete")}
        </ActionButton>
      )}
    >
      <Button variant="outline">
        <Trash size={18} color="red" />
      </Button>
    </ActionConfirmingDialog>
  );
}
