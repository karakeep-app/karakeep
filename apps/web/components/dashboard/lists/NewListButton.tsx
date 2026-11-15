"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { Plus } from "lucide-react";

import { EditListModal } from "./EditListModal";

export function NewListButton() {
  const { t } = useTranslation();
  return (
    <EditListModal>
      <Button>
        <Plus className="size-4" />
        <span>{t("lists.new_list")}</span>
      </Button>
    </EditListModal>
  );
}
