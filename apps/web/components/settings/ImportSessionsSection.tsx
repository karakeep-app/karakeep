"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
        <Empty className="p-4 md:p-6">
          <EmptyHeader>
            <EmptyTitle className="text-base">
              {t("settings.import_sessions.load_error")}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
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
        <Empty className="p-4 md:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package />
            </EmptyMedia>
            <EmptyTitle className="text-base">
              {t("settings.import_sessions.no_sessions")}
            </EmptyTitle>
            <EmptyDescription>
              {t("settings.import_sessions.no_sessions_detail")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </SettingsSection>
  );
}
