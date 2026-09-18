import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";

import useAppSettings from "../settings";
import {
  getSystemLanguage,
  i18n,
  resolveAppLanguage,
  setAppLanguage,
} from "./index";

/**
 * Binds the i18next singleton to the app lifecycle:
 * - applies the stored language override (or the OS language) on mount,
 * - re-applies it whenever settings finish loading or the override changes.
 *
 * Mount this once near the top of the provider tree (inside `Providers`).
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoading } = useAppSettings();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    void setAppLanguage(
      resolveAppLanguage(settings.language, getSystemLanguage()),
    );
  }, [isLoading, settings.language]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
