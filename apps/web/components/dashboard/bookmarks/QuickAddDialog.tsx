"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/client";
import { useQuickAddStore } from "@/lib/store/useQuickAddStore";

import { QuickAddForm } from "./QuickAddForm";

export default function QuickAddDialog() {
  const { t } = useTranslation();
  const open = useQuickAddStore((s) => s.dialogOpen);
  const setOpen = useQuickAddStore((s) => s.setDialogOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editor.new_item")}</DialogTitle>
          <DialogDescription>
            {t("dashboard.quick_add_description")}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <QuickAddForm
            className="min-h-40"
            autoResize
            autoFocus
            onSuccess={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
