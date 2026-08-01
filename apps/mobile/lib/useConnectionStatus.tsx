import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { fetch } from "expo/fetch";
import { onlineManager } from "@tanstack/react-query";

import { buildApiHeaders } from "./utils";
import useAppSettings from "./settings";

export type ConnectionStatus =
  | "checking"
  | "online"
  | "device-offline"
  | "server-unreachable";

const HEALTH_CHECK_INTERVAL = 30_000;
const HEALTH_CHECK_TIMEOUT = 5_000;

const ConnectionStatusContext = createContext<ConnectionStatus>("checking");

function useConnectionStatusMonitor(enabled: boolean): ConnectionStatus {
  const { settings } = useAppSettings();
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    onlineManager.isOnline() ? "checking" : "device-offline",
  );

  useEffect(() => {
    if (!enabled) {
      setStatus("checking");
      return;
    }

    let active = true;
    let currentRequest: AbortController | undefined;

    const checkServer = async () => {
      if (!onlineManager.isOnline()) {
        currentRequest?.abort();
        if (active) {
          setStatus("device-offline");
        }
        return;
      }

      currentRequest?.abort();
      const controller = new AbortController();
      currentRequest = controller;
      const timeout = setTimeout(
        () => controller.abort(),
        HEALTH_CHECK_TIMEOUT,
      );

      try {
        const response = await fetch(`${settings.address}/api/health`, {
          headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        const healthy =
          response.ok &&
          typeof result === "object" &&
          result !== null &&
          "status" in result &&
          result.status === "ok";

        if (active && currentRequest === controller) {
          setStatus(healthy ? "online" : "server-unreachable");
        }
      } catch {
        if (
          active &&
          currentRequest === controller &&
          onlineManager.isOnline()
        ) {
          setStatus("server-unreachable");
        }
      } finally {
        clearTimeout(timeout);
      }
    };

    const onConnectivityChange = (online: boolean) => {
      if (!online) {
        currentRequest?.abort();
        setStatus("device-offline");
        return;
      }

      setStatus("checking");
      void checkServer();
    };

    void checkServer();
    const unsubscribe = onlineManager.subscribe(onConnectivityChange);
    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void checkServer();
      }
    }, HEALTH_CHECK_INTERVAL);
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          void checkServer();
        }
      },
    );

    return () => {
      active = false;
      currentRequest?.abort();
      clearInterval(interval);
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [enabled, settings.address, settings.apiKey, settings.customHeaders]);

  return status;
}

export function ConnectionStatusProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const status = useConnectionStatusMonitor(enabled);

  return (
    <ConnectionStatusContext.Provider value={status}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

export function useConnectionStatus(): ConnectionStatus {
  return useContext(ConnectionStatusContext);
}
