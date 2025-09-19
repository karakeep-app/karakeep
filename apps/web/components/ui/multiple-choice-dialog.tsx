import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function MultipleChoiceDialog({
  open: userIsOpen,
  setOpen: userSetOpen,
  onOpenChange,
  title,
  description,
  actionButtons,
  children,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  actionButtons: ((
    setDialogOpen: (open: boolean) => void,
  ) => React.ReactNode)[];
  children?: React.ReactNode;
}) {
  const [customIsOpen, setCustomIsOpen] = useState(false);
  const [isDialogOpen, setDialogOpen] = [
    userIsOpen ?? customIsOpen,
    userSetOpen ?? setCustomIsOpen,
  ];
  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(isOpen) => {
        onOpenChange?.(isOpen);
        setDialogOpen(isOpen);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description}
        <DialogFooter className="sm:justify-end">
          {actionButtons.map((actionButton) => actionButton(setDialogOpen))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
