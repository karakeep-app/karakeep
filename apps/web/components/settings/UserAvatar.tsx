"use client";

import type { ChangeEvent } from "react";
import { useRef } from "react";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import { UserAvatar as UserAvatarImage } from "@/components/ui/user-avatar";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import { Upload, X } from "lucide-react";

import {
  useUpdateUserAvatar,
  useWhoAmI,
} from "@karakeep/shared-react/hooks/users";

import { RowIconButton } from "./RowActions";
import { SettingsRow } from "./SettingsPage";

export default function UserAvatar() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const whoami = useWhoAmI();
  const image = whoami.data?.image ?? null;

  const updateAvatar = useUpdateUserAvatar({
    onError: () => {
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
    },
  });

  const upload = useUpload({
    onSuccess: async (resp) => {
      try {
        await updateAvatar.mutateAsync({ assetId: resp.assetId });
        toast({
          description: t("settings.info.avatar.updated"),
        });
      } catch {
        // handled in onError
      }
    },
    onError: (err) => {
      toast({
        description: err.error,
        variant: "destructive",
      });
    },
  });

  const isBusy = upload.isPending || updateAvatar.isPending;

  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    upload.mutate(file);
    event.target.value = "";
  };

  return (
    <SettingsRow label={t("settings.info.avatar.title")}>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
          <UserAvatarImage
            image={image}
            name={whoami.data?.name}
            // Blank until the name loads, rather than a placeholder initial.
            fallback={whoami.data ? undefined : <span />}
            className="h-full w-full"
            fallbackClassName="bg-muted text-foreground"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <ActionButton
          type="button"
          variant="outline"
          className="min-w-0 flex-1"
          onClick={handleSelectFile}
          loading={upload.isPending}
          disabled={isBusy}
        >
          <Upload className="size-4" />
          {image
            ? t("settings.info.avatar.change")
            : t("settings.info.avatar.upload")}
        </ActionButton>
        {image && (
          <ActionConfirmingDialog
            title={t("settings.info.avatar.remove_confirm_title")}
            description={
              <p>{t("settings.info.avatar.remove_confirm_description")}</p>
            }
            actionButton={(setDialogOpen) => (
              <ActionButton
                type="button"
                variant="destructive"
                loading={updateAvatar.isPending}
                onClick={() =>
                  updateAvatar.mutate(
                    { assetId: null },
                    {
                      onSuccess: () => {
                        toast({
                          description: t("settings.info.avatar.removed"),
                        });
                        setDialogOpen(false);
                      },
                    },
                  )
                }
              >
                {t("settings.info.avatar.remove")}
              </ActionButton>
            )}
          >
            <RowIconButton
              type="button"
              label={t("settings.info.avatar.remove")}
              destructive
              disabled={isBusy}
            >
              <X className="size-4" />
            </RowIconButton>
          </ActionConfirmingDialog>
        )}
      </div>
    </SettingsRow>
  );
}
