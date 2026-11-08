import { ADMIN_HOME, adminNavGroups } from "@/components/admin/adminNav";
import { SectionIndex } from "@/components/settings/SectionNav";
import { useTranslation } from "@/lib/i18n/server";

export default async function AdminHomepage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <SectionIndex
      title={t("admin.admin_settings")}
      groups={adminNavGroups(t)}
      desktopPath={ADMIN_HOME}
    />
  );
}
