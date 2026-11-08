import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { Lock } from "lucide-react";

import { Label } from "../ui/label";
import ProfileNameForm from "./ProfileNameForm";
import { SettingsRow, SettingsRows, SettingsSection } from "./SettingsPage";
import UserAvatar from "./UserAvatar";

export default async function UserDetails() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const whoami = await api.users.whoami();
  const [emailHintBefore, emailHintLink, emailHintAfter] = t(
    "settings.info.email_locked",
  ).split(/<\/?link>/);

  return (
    <SettingsSection title={t("settings.info.basic_details")}>
      <SettingsRows>
        <UserAvatar />
        <SettingsRow
          label={<Label htmlFor="email">{t("common.email")}</Label>}
          description={
            whoami.localUser ? (
              <>
                {emailHintBefore}
                <Link
                  href="/settings/import"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {emailHintLink}
                </Link>
                {emailHintAfter}
              </>
            ) : (
              t("settings.info.details_locked_oauth")
            )
          }
        >
          <Input
            id="email"
            type="email"
            defaultValue={whoami.email ?? ""}
            endIcon={<Lock className="size-4 text-muted-foreground" />}
            disabled
          />
        </SettingsRow>
        <ProfileNameForm name={whoami.name ?? ""} />
      </SettingsRows>
    </SettingsSection>
  );
}
