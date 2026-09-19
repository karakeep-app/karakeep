"use client";

import { Button } from "@/components/ui/button";
import { CopyBtnV2 } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@karakeep/shared-react/trpc";

export function ShareBookmarkModal({
  bookmarkId,
  open,
  setOpen,
}: {
  bookmarkId: string;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();
  const clientConfig = useClientConfig();

  const { data, isPending: isLoading } = useQuery(
    api.bookmarks.getPublicShare.queryOptions(
      { bookmarkId },
      { enabled: open },
    ),
  );
  const { mutate: setPublicShare, isPending: isUpdating } = useMutation(
    api.bookmarks.setPublicShare.mutationOptions({
      onSuccess: (res) => {
        queryClient.setQueryData(
          api.bookmarks.getPublicShare.queryKey({ bookmarkId }),
          res,
        );
      },
      onError: () => {
        toast.error(t("common.something_went_wrong"));
      },
    }),
  );

  const token = data?.token ?? null;
  const publicUrl = token
    ? `${clientConfig.publicUrl}/public/bookmarks/${token}`
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialogs.bookmarks.share_bookmark")}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="mt-4 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label
                htmlFor="public-bookmark-toggle"
                className="text-sm font-medium"
              >
                {t("dialogs.bookmarks.public_link.title")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("dialogs.bookmarks.public_link.description")}
              </p>
            </div>
            <Switch
              id="public-bookmark-toggle"
              checked={token !== null}
              disabled={isLoading || isUpdating || !!clientConfig.demoMode}
              onCheckedChange={(checked) => {
                setPublicShare({ bookmarkId, enabled: checked });
              }}
            />
          </div>
          {publicUrl && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {t("dialogs.bookmarks.public_link.share_link")}
              </Label>
              <div className="flex items-center space-x-2">
                <Input value={publicUrl} readOnly className="flex-1 text-sm" />
                <CopyBtnV2 getStringToCopy={() => publicUrl} />
              </div>
            </div>
          )}
        </DialogDescription>
        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
