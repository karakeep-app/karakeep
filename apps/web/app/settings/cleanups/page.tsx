import type { Metadata } from "next";
import { TagDuplicationDetection } from "@/components/dashboard/cleanups/TagDuplicationDetention";
import {
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsPage";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("cleanups.cleanups")} | Karakeep`,
  };
}

export default async function CleanupsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <SettingsPage
      title={t("cleanups.cleanups")}
      description={t("cleanups.description")}
    >
      <SettingsSection title={t("cleanups.duplicate_tags.title")}>
        <TagDuplicationDetection />
      </SettingsSection>
    </SettingsPage>
  );
}
