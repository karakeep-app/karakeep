import { describe, expect, it, vi } from "vitest";

import {
  downloadBlockedReason,
  watchDownloadConditions,
} from "./offlineDownloadConditions";
import type { DownloadConditions } from "./offlineDownloadConditions";
import { syncOfflineArticles } from "./offlineSync";

const both = {
  automaticOfflineWifiOnly: true,
  automaticOfflineChargingOnly: true,
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function source(initial: boolean | null) {
  let listener: (value: boolean | null) => void = vi.fn();
  const unsubscribe = vi.fn();
  return {
    read: vi.fn(async (): Promise<boolean | null> => initial),
    subscribe: (callback: typeof listener) => {
      listener = callback;
      return unsubscribe;
    },
    emit: (value: boolean | null) => listener(value),
    unsubscribe,
  };
}

describe("offline download restrictions", () => {
  it.each([
    [false, false, null, null, false],
    [true, false, true, false, false],
    [true, false, false, true, true],
    [true, false, null, true, true],
    [false, true, false, true, false],
    [false, true, true, false, true],
    [false, true, true, null, true],
    [true, true, true, true, false],
    [true, true, true, false, true],
    [true, true, false, true, true],
  ])(
    "combines Wi-Fi %s and charging %s restrictions",
    (wifiOnly, chargingOnly, wifi, charging, blocked) => {
      expect(
        !!downloadBlockedReason(
          {
            automaticOfflineWifiOnly: wifiOnly,
            automaticOfflineChargingOnly: chargingOnly,
          },
          { wifi, charging },
        ),
      ).toBe(blocked);
    },
  );

  it("blocks until confirmed and responds to unplugging and network changes", async () => {
    const wifi = source(true),
      charging = source(true);
    const updates = vi.fn();
    const monitor = watchDownloadConditions({ wifi, charging }, updates);
    expect(
      downloadBlockedReason(both, updates.mock.lastCall![0]),
    ).toBeDefined();
    await flush();
    expect(
      downloadBlockedReason(both, updates.mock.lastCall![0]),
    ).toBeUndefined();
    charging.emit(false);
    expect(downloadBlockedReason(both, updates.mock.lastCall![0])).toContain(
      "charging",
    );
    charging.emit(true);
    wifi.emit(false);
    expect(downloadBlockedReason(both, updates.mock.lastCall![0])).toContain(
      "Wi-Fi",
    );
    monitor.dispose();
    expect(wifi.unsubscribe).toHaveBeenCalledOnce();
    expect(charging.unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not let a pending initial read overwrite a newer event", async () => {
    const wifi = source(true),
      charging = source(true);
    let resolve: (value: boolean) => void = vi.fn();
    wifi.read.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const updates = vi.fn();
    const monitor = watchDownloadConditions({ wifi, charging }, updates);
    wifi.emit(false);
    resolve(true);
    await flush();
    expect(updates.mock.lastCall![0].wifi).toBe(false);
    monitor.dispose();
  });

  it("rechecks on foreground refresh and fails closed when a reading fails", async () => {
    const wifi = source(true),
      charging = source(true);
    const updates = vi.fn();
    const monitor = watchDownloadConditions({ wifi, charging }, updates);
    await flush();
    wifi.read.mockRejectedValue(new Error("unavailable"));
    monitor.refresh();
    expect(updates.mock.lastCall![0]).toEqual({ wifi: null, charging: null });
    await flush();
    expect(updates.mock.lastCall![0]).toEqual({ wifi: null, charging: true });
    monitor.dispose();
    const calls = updates.mock.calls.length;
    monitor.refresh();
    await flush();
    expect(updates).toHaveBeenCalledTimes(calls);
  });

  it("rejects reads superseded by a second foreground refresh", async () => {
    const wifi = source(true),
      charging = source(true);
    const resolves: ((value: boolean) => void)[] = [];
    wifi.read.mockImplementation(
      () => new Promise((done) => resolves.push(done)),
    );
    const updates = vi.fn();
    const monitor = watchDownloadConditions({ wifi, charging }, updates);
    monitor.refresh();
    resolves[1](false);
    await flush();
    resolves[0](true);
    await flush();
    expect(updates.mock.lastCall![0].wifi).toBe(false);
    monitor.dispose();
  });

  it.each(["wifi", "charging"] as const)(
    "cancels without saving or pruning when %s changes during a request",
    async (key) => {
      const wifi = source(true),
        charging = source(true);
      const controller = new AbortController();
      let conditions: DownloadConditions = { wifi: null, charging: null };
      let started = false;
      const monitor = watchDownloadConditions({ wifi, charging }, (next) => {
        conditions = next;
        if (started && downloadBlockedReason(both, next)) controller.abort();
      });
      await flush();
      expect(downloadBlockedReason(both, conditions)).toBeUndefined();
      started = true;
      const save = vi.fn(),
        prune = vi.fn();
      await expect(
        syncOfflineArticles({
          count: 1,
          signal: controller.signal,
          list: async () => ({
            bookmarks: [{ id: "a", content: { type: "link" } }],
            nextCursor: null,
          }),
          download: async () => {
            ({ wifi, charging })[key].emit(false);
            return { id: "a", content: { type: "link" } };
          },
          save,
          prune,
          onProgress: vi.fn(),
        }),
      ).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
      expect(prune).not.toHaveBeenCalled();
      monitor.dispose();
    },
  );
});
