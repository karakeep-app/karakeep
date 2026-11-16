import type { Metadata } from "next";
import TTSSettings from "@/components/settings/TTSSettings";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.tts.tts_settings")} | Karakeep`,
  };
}

export default function TTSSettingsPage() {
  return <TTSSettings />;
}
