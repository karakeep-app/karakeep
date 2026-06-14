"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-background p-5 shadow-sm dark:border-gray-700">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words text-base font-semibold">{value}</div>
    </div>
  );
}

function VideoConfigSkeleton() {
  return (
    <AdminCard>
      <div className="mb-4 h-7 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-gray-200 bg-background dark:border-gray-700"
          ></div>
        ))}
      </div>
    </AdminCard>
  );
}

export default function VideoConfigCard() {
  const api = useTRPC();
  const { data: config } = useQuery(api.admin.videoConfig.queryOptions());

  if (!config) {
    return <VideoConfigSkeleton />;
  }

  const maxSizeLabel =
    config.maxVideoDownloadSizeMb < 0
      ? "No limit"
      : `${config.maxVideoDownloadSizeMb} MB`;

  return (
    <AdminCard>
      <div className="mb-2 text-xl font-medium">Video downloads</div>
      <p className="mb-4 text-sm text-muted-foreground">
        Read-only view of the server&apos;s yt-dlp video capture configuration.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Enabled by default"
          value={config.enabled ? "Yes" : "No"}
        />
        <Stat label="Max download size" value={maxSizeLabel} />
        <Stat
          label="Download timeout"
          value={`${config.downloadVideoTimeoutSec}s`}
        />
        <Stat
          label="Extra yt-dlp args"
          value={
            config.ytDlpArguments.length > 0
              ? config.ytDlpArguments.join(" ")
              : "None"
          }
        />
      </div>
    </AdminCard>
  );
}
