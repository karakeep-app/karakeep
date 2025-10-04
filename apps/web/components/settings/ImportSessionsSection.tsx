"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useListImportSessions } from "@/lib/hooks/useImportSessions";
import { useTranslation } from "@/lib/i18n/client";
import { Package } from "lucide-react";

import { FullPageSpinner } from "../ui/full-page-spinner";
import { ImportSessionCard } from "./ImportSessionCard";

export function ImportSessionsSection() {
  const { t } = useTranslation();
  const { data: sessions, isLoading, error } = useListImportSessions();

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">
            {t("settings.import_sessions.title")}
          </h3>
        </div>
        <FullPageSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">
            {t("settings.import_sessions.title")}
          </h3>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-gray-600">
              {t("settings.import_sessions.load_error")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h3 className="text-lg font-medium">
          {t("settings.import_sessions.title")}
        </h3>
        <p className="mt-1 text-sm text-accent-foreground">
          {t("settings.import_sessions.description")}
        </p>
      </div>

      {sessions && sessions.length > 0 ? (
        <div className="space-y-4">
          {sessions.map((session) => (
            <ImportSessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="mb-4 h-12 w-12 text-gray-400" />
            <p className="mb-2 text-center text-gray-600">
              {t("settings.import_sessions.no_sessions")}
            </p>
            <p className="text-center text-sm text-gray-500">
              {t("settings.import_sessions.no_sessions_detail")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
