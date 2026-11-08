import { useState } from "react";
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

import { Button } from "./button";

export default function ActionConfirmingDialog({
  title,
  description,
  actionButton,
  children,
  onCloseAutoFocus,
  open: userIsOpen,
  setOpen: userSetOpen,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  actionButton: (setDialogOpen: (open: boolean) => void) => React.ReactNode;
  children?: React.ReactNode;
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const { t } = useTranslation();
  const [customIsOpen, setCustomIsOpen] = useState(false);
  const [isDialogOpen, setDialogOpen] = [
    userIsOpen ?? customIsOpen,
    userSetOpen ?? setCustomIsOpen,
  ];
  return (
    <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* A div, as some of these hold paragraphs or a control to go with them. */}
        <DialogDescription asChild>
          <div>{description}</div>
        </DialogDescription>
        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          {actionButton(setDialogOpen)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
