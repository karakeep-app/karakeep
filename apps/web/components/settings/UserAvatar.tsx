"use client";

import type { ChangeEvent } from "react";
import { useRef } from "react";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import { UserAvatar as UserAvatarImage } from "@/components/ui/user-avatar";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import { Image as ImageIcon, Upload, User, X } from "lucide-react";

import {
  useUpdateUserAvatar,
  useWhoAmI,
} from "@karakeep/shared-react/hooks/users";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ImageIcon className="h-5 w-5" />
          {t("settings.info.avatar.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("settings.info.avatar.description")}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border bg-muted">
              <UserAvatarImage
                image={image}
                name={t("settings.info.avatar.title")}
                fallback={<User className="h-7 w-7 text-muted-foreground" />}
                className="h-full w-full"
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
              variant="secondary"
              onClick={handleSelectFile}
              loading={upload.isPending}
              disabled={isBusy}
            >
              <Upload className="mr-2 h-4 w-4" />
              {image
                ? t("settings.info.avatar.change")
                : t("settings.info.avatar.upload")}
            </ActionButton>
          </div>
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
            <Button type="button" variant="outline" disabled={!image || isBusy}>
              <X className="mr-2 h-4 w-4" />
              {t("settings.info.avatar.remove")}
            </Button>
          </ActionConfirmingDialog>
        </div>
      </CardContent>
    </Card>
  );
}
