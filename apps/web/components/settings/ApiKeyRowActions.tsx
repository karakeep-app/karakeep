"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/client";
import { RefreshCcw, Trash2 } from "lucide-react";

import DeleteApiKey from "./DeleteApiKey";
import RegenerateApiKey from "./RegenerateApiKey";
import { RowActionsMenu } from "./RowActions";

export default function ApiKeyRowActions({
  name,
  id,
}: {
  name: string;
  id: string;
}) {
  const { t } = useTranslation();
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <RegenerateApiKey
        name={name}
        id={id}
        open={regenerateOpen}
        setOpen={setRegenerateOpen}
      />
      <DeleteApiKey
        name={name}
        id={id}
        open={deleteOpen}
        setOpen={setDeleteOpen}
      />
      <RowActionsMenu
        label={t("common.actions_for", { name })}
        items={[
          {
            label: t("actions.regenerate"),
            icon: <RefreshCcw className="size-4" />,
            onSelect: () => setRegenerateOpen(true),
          },
          {
            label: t("actions.delete"),
            icon: <Trash2 className="size-4" />,
            destructive: true,
            onSelect: () => setDeleteOpen(true),
          },
        ]}
      />
    </>
  );
}
