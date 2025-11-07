import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { Mail, User } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";

export default async function UserDetails() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const whoami = await api.users.whoami();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <User className="h-5 w-5" />
              {t("settings.info.basic_details")}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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
      </CardContent>
    </Card>
  );
}
