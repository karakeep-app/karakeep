export interface DownloadConditions {
  wifi: boolean | null;
  charging: boolean | null;
}

export interface DownloadPolicy {
  automaticOfflineWifiOnly: boolean;
  automaticOfflineChargingOnly: boolean;
}

export function downloadBlockedReason(
  policy: DownloadPolicy,
  conditions: DownloadConditions,
): string | undefined {
  if (policy.automaticOfflineWifiOnly && conditions.wifi !== true)
    return "Waiting for a confirmed Wi-Fi connection.";
  if (policy.automaticOfflineChargingOnly && conditions.charging !== true)
    return "Waiting for the device to be charging or fully charged on power.";
}

interface ConditionSource {
  read: () => Promise<boolean | null>;
  subscribe: (listener: (value: boolean | null) => void) => () => void;
}

// Native events supersede pending reads; foreground refreshes discard stale
// background state. Unknown or failed readings never satisfy a restriction.
export function watchDownloadConditions(
  sources: Record<keyof DownloadConditions, ConditionSource>,
  onChange: (conditions: DownloadConditions) => void,
) {
  const conditions: DownloadConditions = { wifi: null, charging: null };
  const versions = { wifi: 0, charging: 0 };
  let disposed = false;
  const publish = () => {
    if (!disposed) onChange({ ...conditions });
  };
  const keys = ["wifi", "charging"] as const;
  const unsubscribes = keys.map((key) =>
    sources[key].subscribe((value) => {
      versions[key]++;
      conditions[key] = value;
      publish();
    }),
  );
  const refresh = () => {
    if (disposed) return;
    conditions.wifi = null;
    conditions.charging = null;
    const requests = keys.map((key) => ({ key, version: ++versions[key] }));
    publish();
    for (const { key, version } of requests) {
      void sources[key]
        .read()
        .catch(() => null)
        .then((value) => {
          if (disposed || versions[key] !== version) return;
          conditions[key] = value;
          publish();
        });
    }
  };
  refresh();
  return {
    refresh,
    dispose: () => {
      disposed = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
  };
}
