"use client";

import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@karakeep/shared-react/trpc";

export default function DeleteApiKey({
  name,
  id,
  open,
  setOpen,
}: {
  name: string;
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const router = useRouter();
  const mutator = useMutation(
    api.apiKeys.revoke.mutationOptions({
      onSuccess: () => {
        toast.success(t("settings.api_keys.key_deleted"));
        router.refresh();
      },
    }),
  );

  return (
    <ActionConfirmingDialog
      open={open}
      setOpen={setOpen}
      title={t("settings.api_keys.delete_title")}
      description={t("settings.api_keys.delete_description", { name })}
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
    />
  );
}
