"use client";

import type { ChangeEvent } from "react";
import { useMemo, useRef } from "react";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import { Image as ImageIcon, Upload, User, X } from "lucide-react";

import {
  useUpdateUserAvatar,
  useWhoAmI,
} from "@karakeep/shared-react/hooks/users";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { toast } from "../ui/use-toast";

export default function UserAvatar() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const whoami = useWhoAmI();
  const image = whoami.data?.image ?? null;

  const avatarUrl = useMemo(() => (image ? getAssetUrl(image) : null), [image]);

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
        // Errors are handled by the mutation's onError callback.
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

  const handleRemove = () => {
    updateAvatar.mutate(
      { assetId: null },
      {
        onSuccess: () => {
          toast({
            description: t("settings.info.avatar.removed"),
          });
        },
      },
    );
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
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={t("settings.info.avatar.title")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleSelectFile}
              disabled={isBusy}
            >
              <Upload className="mr-2 h-4 w-4" />
              {avatarUrl
                ? t("settings.info.avatar.change")
                : t("settings.info.avatar.upload")}
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleRemove}
            disabled={!avatarUrl || isBusy}
          >
            <X className="mr-2 h-4 w-4" />
            {t("settings.info.avatar.remove")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
