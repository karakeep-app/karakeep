import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { Mail } from "lucide-react";

import { Label } from "../ui/label";
import { SettingsSection } from "./SettingsPage";

export default async function UserDetails() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const whoami = await api.users.whoami();

  return (
    <SettingsSection title={t("settings.info.basic_details")}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            {t("common.name")}
          </Label>
          <Input
            id="name"
            defaultValue={whoami.name ?? ""}
            className="h-11"
            disabled
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Mail className="h-4 w-4" />
            {t("common.email")}
          </Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              defaultValue={whoami.email ?? ""}
              className="h-11"
              disabled
            />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
