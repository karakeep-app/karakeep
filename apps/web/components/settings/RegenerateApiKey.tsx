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
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { RefreshCcw } from "lucide-react";

import ApiKeySuccess from "./ApiKeySuccess";

export default function RegenerateApiKey({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  const [key, setKey] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  const mutator = api.apiKeys.regenerate.useMutation({
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
  });

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
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Regenerate">
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {key
              ? t("settings.api_keys.key_regenerated")
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
            message={t("settings.api_keys.key_regenerated_please_copy")}
          />
        ) : (
          <p className="text-sm">
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
