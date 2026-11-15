"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import ApiKeySuccess from "./ApiKeySuccess";

export default function RegenerateApiKey({
  id,
  name,
  open: dialogOpen,
  setOpen: setDialogOpen,
}: {
  id: string;
  name: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const router = useRouter();

  const [key, setKey] = useState<string | undefined>(undefined);

  const mutator = useMutation(
    api.apiKeys.regenerate.mutationOptions({
      onSuccess: (resp) => {
        setKey(resp.key);
        router.refresh();
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
        setDialogOpen(false);
      },
    }),
  );

  const handleRegenerate = () => {
    mutator.mutate({ id });
  };

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(o) => {
        setDialogOpen(o);
        setKey(undefined);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {key
              ? t("settings.api_keys.copy_new_key")
              : t("settings.api_keys.regenerate_api_key")}
          </DialogTitle>
          {!key && (
            <DialogDescription>
              {t("settings.api_keys.regenerate_warning", { name })}
            </DialogDescription>
          )}
        </DialogHeader>
        {key ? (
          <ApiKeySuccess
            apiKey={key}
            note={t("settings.api_keys.key_regenerated_please_copy")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("settings.api_keys.regenerate_confirmation")}
          </p>
        )}
        <DialogFooter className="sm:justify-end">
          {!key ? (
            <>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <ActionButton
                variant="destructive"
                onClick={handleRegenerate}
                loading={mutator.isPending}
              >
                {t("actions.regenerate")}
              </ActionButton>
            </>
          ) : (
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("actions.close")}
              </Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
