import { useState } from "react";
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
import { useTranslation } from "@/lib/i18n/client";

import { ZBookmarkList } from "@karakeep/shared/types/lists";

import PublicListLink from "./PublicListLink";
import RssLink from "./RssLink";

export function ShareListModal({
  open: userOpen,
  setOpen: userSetOpen,
  list,
  children,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  list: ZBookmarkList;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (
    (userOpen !== undefined && !userSetOpen) ||
    (userOpen === undefined && userSetOpen)
  ) {
    throw new Error("You must provide both open and setOpen or neither");
  }
  const [customOpen, customSetOpen] = useState(false);
  const [open, setOpen] = [
    userOpen ?? customOpen,
    userSetOpen ?? customSetOpen,
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(s) => {
        setOpen(s);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("lists.share_list")}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="mt-4 space-y-6">
          <PublicListLink list={list} />
          <RssLink listId={list.id} />
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
