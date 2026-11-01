// Shared i18n singleton for the Karakeep mobile app.
//
// Design notes:
// - We reuse the web app's `translation` namespace verbatim (synced via
//   `node tools/mobile-i18n-sync.mjs` into `./web-translations/`) so shared
//   concepts (actions.*, common.*, dialogs.*, toasts.*, ...) are translated
//   identically on web and mobile -- including the existing Polish Weblate
//   translations -- instead of maintaining a second, incompatible copy.
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
import { enUS, pl } from "date-fns/locale";
import * as Localization from "expo-localization";
import { initReactI18next } from "react-i18next";

import enMobile from "./locales/en.json";
import plMobile from "./locales/pl.json";
import enWeb from "./web-translations/en.json";
import plWeb from "./web-translations/pl.json";

export const FALLBACK_LANGUAGE = "en";

/**
 * Languages with full mobile translations, in the order preferred when
 * matching a device locale. Add a new code here once both
 * `web-translations/<lang>.json` (via the sync script) and
 * `locales/<lang>.json` exist.
 */
export const SUPPORTED_LANGUAGES = ["en", "pl"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_NAMESPACE = "mobile";

const resources = {
  en: {
    mobile: enMobile,
    translation: enWeb,
  },
  pl: {
    mobile: plMobile,
    translation: plWeb,
  },
} as const;

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

/**
 * Best-match a list of BCP-47 device locales (e.g. "pl-PL", "en-US")
 * against the languages mobile ships translations for.
 *
 * Matching order per candidate locale:
 *   1. exact match ("pt-BR" if we ever ship it),
 *   2. bare language code ("pl" from "pl-PL"),
 *   3. `SUPPORTED_LANGUAGES` order fallback is applied by the caller.
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

const DATE_FNS_LOCALES: Record<SupportedLanguage, Locale> = {
  en: enUS,
  pl,
};

/** date-fns locale matching the currently active app language. */
export function getDateFnsLocale(): Locale {
  const lng = i18n.language;
  return isSupportedLanguage(lng) ? DATE_FNS_LOCALES[lng] : enUS;
}

/**
 * BCP-47 locale tag for `Intl.*` APIs (`Intl.NumberFormat`,
 * `Intl.DateTimeFormat`), following the active app language.
 */
export function getIntlLocale(): string {
  return isSupportedLanguage(i18n.language) ? i18n.language : FALLBACK_LANGUAGE;
}
