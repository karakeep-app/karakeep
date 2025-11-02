"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";

function ConnectionStatus({
  label,
  configured,
  connected,
  pluginName,
  error,
}: {
  label: string;
  configured: boolean;
  connected: boolean;
  pluginName?: string;
  error?: string;
}) {
  const { t } = useTranslation();

  let statusText = t("admin.service_connections.status.not_configured");
  let badgeColor =
    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  let iconColor = "text-gray-400";
  let borderColor = "border-gray-200 dark:border-gray-700";

  if (configured) {
    if (connected) {
      statusText = t("admin.service_connections.status.connected");
      badgeColor =
        "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400";
      iconColor = "text-green-500";
      borderColor = "border-green-200 dark:border-green-800";
    } else {
      statusText = t("admin.service_connections.status.disconnected");
      badgeColor =
        "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400";
      iconColor = "text-red-500";
      borderColor = "border-red-200 dark:border-red-800";
    }
  }

  return (
    <div
      className={`rounded-lg border ${borderColor} bg-background p-5 shadow-sm transition-all sm:w-1/3`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">{label}</div>
          {pluginName && (
            <div className="mt-1 text-xs text-muted-foreground">
              {pluginName}
            </div>
          )}
        </div>
        <div
          className={`flex h-2 w-2 items-center justify-center rounded-full ${iconColor}`}
        >
          <div
            className={`h-2 w-2 rounded-full ${connected && configured ? "animate-pulse" : ""} bg-current`}
          ></div>
        </div>
      </div>
      <div className="mb-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColor}`}
        >
          {statusText}
        </span>
      </div>
      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-2 dark:bg-red-900/10">
          <p className="text-xs text-red-600 dark:text-red-400" title={error}>
            {error.length > 60 ? `${error.substring(0, 60)}...` : error}
          </p>
        </div>
      )}
    </div>
  );
}

function ConnectionsSkeleton() {
  return (
    <AdminCard>
      <div className="mb-4 h-7 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
      <div className="flex flex-col gap-4 sm:flex-row">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-background p-5 shadow-sm dark:border-gray-700 sm:w-1/3"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="h-5 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
              <div className="h-2 w-2 animate-pulse rounded-full bg-gray-300 dark:bg-gray-600"></div>
            </div>
            <div className="mb-2">
              <div className="h-5 w-20 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700"></div>
            </div>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

export default function ServiceConnections() {
  const { t } = useTranslation();
  const { data: connections } = api.admin.checkConnections.useQuery(undefined, {
    refetchInterval: 10000,
  });

  if (!connections) {
    return <ConnectionsSkeleton />;
  }

  return (
    <AdminCard>
      <div className="mb-2 text-xl font-medium">
        {t("admin.service_connections.title")}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {t("admin.service_connections.description")}
      </p>
      <div className="flex flex-col gap-4 sm:flex-row">
        <ConnectionStatus
          label={t("admin.service_connections.search_engine")}
          configured={connections.searchEngine.configured}
          connected={connections.searchEngine.connected}
          pluginName={connections.searchEngine.pluginName}
          error={connections.searchEngine.error}
        />
        <ConnectionStatus
          label={t("admin.service_connections.browser")}
          configured={connections.browser.configured}
          connected={connections.browser.connected}
          pluginName={connections.browser.pluginName}
          error={connections.browser.error}
        />
        <ConnectionStatus
          label={t("admin.service_connections.queue_system")}
          configured={connections.queue.configured}
          connected={connections.queue.connected}
          pluginName={connections.queue.pluginName}
          error={connections.queue.error}
        />
      </div>
    </AdminCard>
  );
}
