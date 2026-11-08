// Shared i18n singleton for the Karakeep mobile app.
//
// Design notes:
// - We import the web app's `translation` namespace straight from
//   `apps/web/lib/i18n/locales/` so shared concepts (actions.*, common.*,
//   dialogs.*, toasts.*, ...) are translated identically on web and mobile
//   -- including the community Weblate translations -- without a copy.
//   Metro can bundle it because the workspace root is in `watchFolders`.
// - Mobile-only strings live in the `mobile` namespace (`./locales/*.json`).
// - Metro bundles `resourcesToBackend`-style dynamic `import()` of JSON
//   poorly (the bundler must statically know every file), so all resources
//   are imported statically here. Enabling Hermes bytecode for them is not
//   needed; plain JSON imports are compiled into the bundle.
// - Language detection prefers an explicit user override (persisted in the
//   existing app settings store under the `language` key) and otherwise
//   follows the OS preferred locales via expo-localization.
// - `supportedLangs` from `@karakeep/shared/langs` is the source of truth
//   for language codes; `SUPPORTED_LANGUAGES` below is the subset mobile has
//   complete `mobile`-namespace translations for.
import i18next from "i18next";
import type { Locale } from "date-fns";
import { enUS, pl as plDateFns } from "date-fns/locale";
import * as Localization from "expo-localization";
import { initReactI18next } from "react-i18next";

import enMobile from "./locales/en.json";
import plMobile from "./locales/pl.json";
import enWeb from "../../../web/lib/i18n/locales/en/translation.json";
import plWeb from "../../../web/lib/i18n/locales/pl/translation.json";

interface LanguageResources {
  mobile: Record<string, unknown>;
  translation: Record<string, unknown>;
  dateFns: Locale;
}

/**
 * Every language the app ships. English is the source language and the
 * fallback for missing keys; any other language is just an entry here.
 *
 * To add one: create `./locales/<lang>.json` with the keys of `en.json`
 * translated, then add an entry pointing at it, the web app's
 * `<lang>/translation.json` and the matching date-fns locale.
 */
const LANGUAGES = {
  en: { mobile: enMobile, translation: enWeb, dateFns: enUS },
  pl: { mobile: plMobile, translation: plWeb, dateFns: plDateFns },
} satisfies Record<string, LanguageResources>;

export type SupportedLanguage = keyof typeof LANGUAGES;

export const FALLBACK_LANGUAGE = "en" satisfies SupportedLanguage;

export const SUPPORTED_LANGUAGES = Object.keys(
  LANGUAGES,
) as SupportedLanguage[];

export const DEFAULT_NAMESPACE = "mobile";

const resources = Object.fromEntries(
  Object.entries(LANGUAGES).map(([lng, { mobile, translation }]) => [
    lng,
    { mobile, translation },
  ]),
);

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return Object.hasOwn(LANGUAGES, lang);
}

/**
 * Best-match a list of BCP-47 device locales (e.g. "en-US", "pt-BR")
 * against the languages mobile ships translations for.
 *
 * Matching order per candidate locale:
 *   1. exact match ("pt-BR" if we ever ship it),
 *   2. bare language code ("en" from "en-GB"),
 * falling back to English when no locale matches.
 */
export function matchSupportedLanguage(
  deviceLocales: readonly { languageTag: string }[],
): SupportedLanguage {
  for (const locale of deviceLocales) {
    const tag = locale.languageTag.replace(/_/g, "-");
    if (isSupportedLanguage(tag)) {
      return tag;
    }
    const base = tag.split("-")[0];
    if (isSupportedLanguage(base)) {
      return base;
    }
  }
  return FALLBACK_LANGUAGE;
}

/** Resolve the system language from the OS preferred locales. */
export function getSystemLanguage(): SupportedLanguage {
  try {
    return matchSupportedLanguage(Localization.getLocales());
  } catch {
    // expo-localization can throw on exotic platforms (web SSR); fall back.
    return FALLBACK_LANGUAGE;
  }
}

/**
 * Resolve the effective app language: an explicit user override ("system"
 * means follow the OS), otherwise the OS language.
 */
export function resolveAppLanguage(
  override: string | undefined,
  systemLanguage: SupportedLanguage = getSystemLanguage(),
): SupportedLanguage {
  if (!override || override === "system") {
    return systemLanguage;
  }
  return isSupportedLanguage(override) ? override : FALLBACK_LANGUAGE;
}

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: getSystemLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  // `mobile` first so short keys resolve to mobile strings; shared web
  // concepts are addressed explicitly as `translation:<path>`.
  ns: ["mobile", "translation"],
  defaultNS: DEFAULT_NAMESPACE,
  fallbackNS: "translation",
  supportedLngs: [...SUPPORTED_LANGUAGES],
  // Mobile never renders raw HTML in translated strings.
  interpolation: {
    escapeValue: false,
  },
  // React Native has no Suspense-for-data-fetching story for translations;
  // resources are bundled synchronously so init is instant.
  react: {
    useSuspense: false,
  },
});

/**
 * Switch the active language at runtime. Safe to call redundantly --
 * i18next ignores no-op `changeLanguage` calls.
 */
export async function setAppLanguage(lng: SupportedLanguage): Promise<void> {
  if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
  }
}

/** date-fns locale matching the currently active app language. */
export function getDateFnsLocale(): Locale {
  const lng = i18n.language;
  return LANGUAGES[isSupportedLanguage(lng) ? lng : FALLBACK_LANGUAGE].dateFns;
}

/**
 * BCP-47 locale tag for `Intl.*` APIs (`Intl.NumberFormat`,
 * `Intl.DateTimeFormat`), following the active app language.
 */
export function getIntlLocale(): string {
  return isSupportedLanguage(i18n.language) ? i18n.language : FALLBACK_LANGUAGE;
}
