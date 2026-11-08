"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { useListImportSessions } from "@/lib/hooks/useImportSessions";
import { useTranslation } from "@/lib/i18n/client";
import { Package } from "lucide-react";

import { FullPageSpinner } from "../ui/full-page-spinner";
import { ImportSessionCard } from "./ImportSessionCard";
import { SettingsSection } from "./SettingsPage";

export function ImportSessionsSection() {
  const { t } = useTranslation();
  const { data: sessions, isLoading, error } = useListImportSessions();

  if (isLoading) {
    return (
      <SettingsSection
        title={t("settings.import_sessions.title")}
        description={t("settings.import_sessions.description")}
      >
        <FullPageSpinner />
      </SettingsSection>
    );
  }

  if (error) {
    return (
      <SettingsSection
        title={t("settings.import_sessions.title")}
        description={t("settings.import_sessions.description")}
      >
        <EmptyState compact title={t("settings.import_sessions.load_error")} />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title={t("settings.import_sessions.title")}
      description={t("settings.import_sessions.description")}
    >
      {sessions && sessions.length > 0 ? (
        <div className="space-y-4">
          {sessions.map((session) => (
            <ImportSessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          inCard
          icon={Package}
          title={t("settings.import_sessions.no_sessions")}
          description={t("settings.import_sessions.no_sessions_detail")}
        />
      )}
    </SettingsSection>
  );
}
