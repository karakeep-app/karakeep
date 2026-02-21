"use client";

import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation } from "@tanstack/react-query";
import { Trash } from "lucide-react";
import { toast } from "sonner";

import { useTRPC } from "@karakeep/shared-react/trpc";

export default function DeleteApiKey({
  name,
  id,
}: {
  name: string;
  id: string;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const router = useRouter();
  const mutator = useMutation(
    api.apiKeys.revoke.mutationOptions({
      onSuccess: () => {
        toast.success("Key was successfully deleted");
        router.refresh();
      },
    }),
  );

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
      <Button variant="ghost" title={t("actions.delete")}>
        <Trash size={18} />
      </Button>
    </ActionConfirmingDialog>
  );
}
