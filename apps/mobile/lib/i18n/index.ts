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
//   poorly (the bundler must statically know every file), so each language
//   `require`s its files with literal paths in `load()`. Metro bundles them
//   all but only evaluates a language when it's loaded, so startup doesn't
//   pay for 30 languages' strings.
// - Language detection prefers an explicit user override (persisted in the
//   existing app settings store under the `language` key) and otherwise
//   follows the OS preferred locales via expo-localization.
// - `supportedLangs` from `@karakeep/shared/langs` is the source of truth
//   for language codes; `SUPPORTED_LANGUAGES` below is the subset mobile has
//   complete `mobile`-namespace translations for (all but `en_US`, since
//   the English source is already US English).
// - Some of those codes aren't valid BCP-47 (`zhtw`, `pt_BR`), so each
//   language also has a `tag` that i18next and `Intl` run on.

// Must load before i18next initializes (see the file for why).
import "./pluralRulesPolyfill";

import i18next from "i18next";
import type { Locale } from "date-fns";
import {
  enGB,
  enUS,
  ar as arDateFns,
  cs as csDateFns,
  da as daDateFns,
  de as deDateFns,
  el as elDateFns,
  es as esDateFns,
  fi as fiDateFns,
  fr as frDateFns,
  gl as glDateFns,
  hr as hrDateFns,
  hu as huDateFns,
  it as itDateFns,
  ja as jaDateFns,
  ko as koDateFns,
  nb as nbDateFns,
  nl as nlDateFns,
  pl as plDateFns,
  pt as ptDateFns,
  ptBR as ptBRDateFns,
  ro as roDateFns,
  ru as ruDateFns,
  sk as skDateFns,
  sl as slDateFns,
  sv as svDateFns,
  tr as trDateFns,
  uk as ukDateFns,
  vi as viDateFns,
  zhCN as zhCNDateFns,
  zhTW as zhTWDateFns,
} from "date-fns/locale";
import * as Localization from "expo-localization";
import { initReactI18next } from "react-i18next";

import enMobile from "./locales/en.json";
import enWeb from "../../../web/lib/i18n/locales/en/translation.json";

interface LanguageResources {
  /**
   * BCP-47 tag i18next and `Intl` run on. The `LANGUAGES` key is the code
   * the web app and the settings use, which isn't always valid BCP-47
   * (`zhtw`, `pt_BR`), and `Intl.PluralRules` throws on those.
   */
  tag: string;
  /** Other OS locale tags that should pick this language. */
  aliases?: readonly string[];
  /** Language to read missing strings from before English. */
  fallback?: string;
  /**
   * Returns the language's strings. Metro bundles every `require` in these,
   * but only runs one when it's called, so the app only evaluates the
   * languages it uses instead of all of them at startup.
   */
  load: () => LanguageStrings;
  dateFns: Locale;
}

interface LanguageStrings {
  mobile: Record<string, unknown>;
  translation: Record<string, unknown>;
}

// `load()` needs literal `require()` paths (see below).
/* oxlint-disable no-require-imports */
/**
 * Every language the app ships. English is the source language and the
 * fallback for missing keys; any other language is just an entry here.
 *
 * To add one: create `./locales/<lang>.json` with the keys of `en.json`
 * translated, then add an entry whose `load()` `require`s it and the web
 * app's `<lang>/translation.json`, plus the matching date-fns locale.
 * `load()` needs literal `require()` paths: Metro bundles them, but only runs
 * one when it's called, whereas a static `import` would evaluate every
 * language at startup.
 */
const LANGUAGES = {
  en: {
    tag: "en",
    load: () => ({ mobile: enMobile, translation: enWeb }),
    dateFns: enUS,
  },
  ar: {
    tag: "ar",
    load: () => ({
      mobile: require("./locales/ar.json"),
      translation: require("../../../web/lib/i18n/locales/ar/translation.json"),
    }),
    dateFns: arDateFns,
  },
  cs: {
    tag: "cs",
    load: () => ({
      mobile: require("./locales/cs.json"),
      translation: require("../../../web/lib/i18n/locales/cs/translation.json"),
    }),
    dateFns: csDateFns,
  },
  da: {
    tag: "da",
    load: () => ({
      mobile: require("./locales/da.json"),
      translation: require("../../../web/lib/i18n/locales/da/translation.json"),
    }),
    dateFns: daDateFns,
  },
  de: {
    tag: "de",
    load: () => ({
      mobile: require("./locales/de.json"),
      translation: require("../../../web/lib/i18n/locales/de/translation.json"),
    }),
    dateFns: deDateFns,
  },
  el: {
    tag: "el",
    load: () => ({
      mobile: require("./locales/el.json"),
      translation: require("../../../web/lib/i18n/locales/el/translation.json"),
    }),
    dateFns: elDateFns,
  },
  es: {
    tag: "es",
    load: () => ({
      mobile: require("./locales/es.json"),
      translation: require("../../../web/lib/i18n/locales/es/translation.json"),
    }),
    dateFns: esDateFns,
  },
  fi: {
    tag: "fi",
    load: () => ({
      mobile: require("./locales/fi.json"),
      translation: require("../../../web/lib/i18n/locales/fi/translation.json"),
    }),
    dateFns: fiDateFns,
  },
  fr: {
    tag: "fr",
    load: () => ({
      mobile: require("./locales/fr.json"),
      translation: require("../../../web/lib/i18n/locales/fr/translation.json"),
    }),
    dateFns: frDateFns,
  },
  ga: {
    tag: "ga",
    load: () => ({
      mobile: require("./locales/ga.json"),
      translation: require("../../../web/lib/i18n/locales/ga/translation.json"),
    }),
    // date-fns has no Irish locale; Irish users read English dates.
    dateFns: enGB,
  },
  gl: {
    tag: "gl",
    load: () => ({
      mobile: require("./locales/gl.json"),
      translation: require("../../../web/lib/i18n/locales/gl/translation.json"),
    }),
    dateFns: glDateFns,
  },
  hr: {
    tag: "hr",
    load: () => ({
      mobile: require("./locales/hr.json"),
      translation: require("../../../web/lib/i18n/locales/hr/translation.json"),
    }),
    dateFns: hrDateFns,
  },
  hu: {
    tag: "hu",
    load: () => ({
      mobile: require("./locales/hu.json"),
      translation: require("../../../web/lib/i18n/locales/hu/translation.json"),
    }),
    dateFns: huDateFns,
  },
  it: {
    tag: "it",
    load: () => ({
      mobile: require("./locales/it.json"),
      translation: require("../../../web/lib/i18n/locales/it/translation.json"),
    }),
    dateFns: itDateFns,
  },
  ja: {
    tag: "ja",
    load: () => ({
      mobile: require("./locales/ja.json"),
      translation: require("../../../web/lib/i18n/locales/ja/translation.json"),
    }),
    dateFns: jaDateFns,
  },
  ko: {
    tag: "ko",
    load: () => ({
      mobile: require("./locales/ko.json"),
      translation: require("../../../web/lib/i18n/locales/ko/translation.json"),
    }),
    dateFns: koDateFns,
  },
  nb_NO: {
    tag: "nb-NO",
    aliases: ["nb", "no", "nn"],
    load: () => ({
      mobile: require("./locales/nb_NO.json"),
      translation: require("../../../web/lib/i18n/locales/nb_NO/translation.json"),
    }),
    dateFns: nbDateFns,
  },
  nl: {
    tag: "nl",
    load: () => ({
      mobile: require("./locales/nl.json"),
      translation: require("../../../web/lib/i18n/locales/nl/translation.json"),
    }),
    dateFns: nlDateFns,
  },
  pl: {
    tag: "pl",
    load: () => ({
      mobile: require("./locales/pl.json"),
      translation: require("../../../web/lib/i18n/locales/pl/translation.json"),
    }),
    dateFns: plDateFns,
  },
  pt: {
    // Bare "pt" gets Brazilian plural rules (0 is singular); `pt` is the
    // European Portuguese translation.
    tag: "pt-PT",
    load: () => ({
      mobile: require("./locales/pt.json"),
      translation: require("../../../web/lib/i18n/locales/pt/translation.json"),
    }),
    dateFns: ptDateFns,
  },
  pt_BR: {
    tag: "pt-BR",
    // Shared web strings missing in Brazilian Portuguese read better in
    // European Portuguese than in English.
    fallback: "pt",
    load: () => ({
      mobile: require("./locales/pt_BR.json"),
      translation: require("../../../web/lib/i18n/locales/pt_BR/translation.json"),
    }),
    dateFns: ptBRDateFns,
  },
  ro: {
    tag: "ro",
    load: () => ({
      mobile: require("./locales/ro.json"),
      translation: require("../../../web/lib/i18n/locales/ro/translation.json"),
    }),
    dateFns: roDateFns,
  },
  ru: {
    tag: "ru",
    load: () => ({
      mobile: require("./locales/ru.json"),
      translation: require("../../../web/lib/i18n/locales/ru/translation.json"),
    }),
    dateFns: ruDateFns,
  },
  sk: {
    tag: "sk",
    load: () => ({
      mobile: require("./locales/sk.json"),
      translation: require("../../../web/lib/i18n/locales/sk/translation.json"),
    }),
    dateFns: skDateFns,
  },
  sl: {
    tag: "sl",
    load: () => ({
      mobile: require("./locales/sl.json"),
      translation: require("../../../web/lib/i18n/locales/sl/translation.json"),
    }),
    dateFns: slDateFns,
  },
  sv: {
    tag: "sv",
    load: () => ({
      mobile: require("./locales/sv.json"),
      translation: require("../../../web/lib/i18n/locales/sv/translation.json"),
    }),
    dateFns: svDateFns,
  },
  tr: {
    tag: "tr",
    load: () => ({
      mobile: require("./locales/tr.json"),
      translation: require("../../../web/lib/i18n/locales/tr/translation.json"),
    }),
    dateFns: trDateFns,
  },
  uk: {
    tag: "uk",
    load: () => ({
      mobile: require("./locales/uk.json"),
      translation: require("../../../web/lib/i18n/locales/uk/translation.json"),
    }),
    dateFns: ukDateFns,
  },
  vi: {
    tag: "vi",
    load: () => ({
      mobile: require("./locales/vi.json"),
      translation: require("../../../web/lib/i18n/locales/vi/translation.json"),
    }),
    dateFns: viDateFns,
  },
  zh: {
    tag: "zh-Hans",
    load: () => ({
      mobile: require("./locales/zh.json"),
      translation: require("../../../web/lib/i18n/locales/zh/translation.json"),
    }),
    dateFns: zhCNDateFns,
  },
  zhtw: {
    tag: "zh-Hant",
    aliases: ["zh-TW", "zh-HK", "zh-MO"],
    load: () => ({
      mobile: require("./locales/zhtw.json"),
      translation: require("../../../web/lib/i18n/locales/zhtw/translation.json"),
    }),
    dateFns: zhTWDateFns,
  },
} satisfies Record<string, LanguageResources>;
/* oxlint-enable no-require-imports */

export type SupportedLanguage = keyof typeof LANGUAGES;

export const FALLBACK_LANGUAGE = "en" satisfies SupportedLanguage;

export const SUPPORTED_LANGUAGES = Object.keys(
  LANGUAGES,
) as SupportedLanguage[];

export const DEFAULT_NAMESPACE = "mobile";

const LANGUAGE_ENTRIES = Object.entries(LANGUAGES) as [
  SupportedLanguage,
  LanguageResources,
][];

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return Object.hasOwn(LANGUAGES, lang);
}

/** A language plus the ones it falls back to, ending with English. */
function withFallbacks(lang: SupportedLanguage): SupportedLanguage[] {
  const chain: SupportedLanguage[] = [];
  for (
    let next: string | undefined = lang;
    next && isSupportedLanguage(next) && !chain.includes(next);
    next = (LANGUAGES[next] as LanguageResources).fallback
  ) {
    chain.push(next);
  }
  if (!chain.includes(FALLBACK_LANGUAGE)) {
    chain.push(FALLBACK_LANGUAGE);
  }
  return chain;
}

/** BCP-47 tag i18next and `Intl` use for a language (`zhtw` → `zh-Hant`). */
export function getLanguageTag(lang: SupportedLanguage): string {
  return LANGUAGES[lang].tag;
}

/** The language whose tag is active in i18next, e.g. `pt_BR` for "pt-BR". */
function getActiveLanguage(): SupportedLanguage {
  return (
    LANGUAGE_ENTRIES.find(([, { tag }]) => tag === i18n.language)?.[0] ??
    FALLBACK_LANGUAGE
  );
}

// Lower-cased code, tag or alias → language.
const LANGUAGE_LOOKUP = new Map<string, SupportedLanguage>(
  LANGUAGE_ENTRIES.flatMap(([lang, { tag, aliases = [] }]) =>
    [lang, lang.replace(/_/g, "-"), tag, ...aliases].map(
      (key) => [key.toLowerCase(), lang] as const,
    ),
  ),
);

/**
 * Best-match a list of BCP-47 device locales (e.g. "en-US", "pt-BR",
 * "zh-Hant-HK") against the languages mobile ships translations for.
 *
 * Matching order per device locale, against each language's code, tag and
 * aliases:
 *   1. the full tag ("pt-BR"),
 *   2. language + script ("zh-Hant" from "zh-Hant-HK"),
 *   3. language + region ("zh-TW" from "zh-Hant-TW"),
 *   4. the bare language ("en" from "en-GB"),
 * falling back to English when no locale matches.
 */
export function matchSupportedLanguage(
  deviceLocales: readonly { languageTag: string }[],
): SupportedLanguage {
  for (const locale of deviceLocales) {
    const tag = locale.languageTag.replace(/_/g, "-");
    const [language, ...subtags] = tag.split("-");
    const script = subtags.find((s) => /^[a-z]{4}$/i.test(s));
    const region = subtags.find((s) => /^([a-z]{2}|\d{3})$/i.test(s));
    const candidates = [
      tag,
      script && `${language}-${script}`,
      region && `${language}-${region}`,
      language,
    ];
    for (const candidate of candidates) {
      const match = candidate && LANGUAGE_LOOKUP.get(candidate.toLowerCase());
      if (match) {
        return match;
      }
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

const initialLanguage = getSystemLanguage();

// i18next runs on the BCP-47 tags, so its plural rules and `i18n.language`
// work. It starts with only English and the system language; the others
// are added by `loadLanguage` when the user picks them.
void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    withFallbacks(initialLanguage).map((lang) => [
      getLanguageTag(lang),
      LANGUAGES[lang].load(),
    ]),
  ),
  lng: getLanguageTag(initialLanguage),
  fallbackLng: Object.fromEntries(
    LANGUAGE_ENTRIES.map(([lang, { tag }]) => [
      tag,
      withFallbacks(lang).slice(1).map(getLanguageTag),
    ]),
  ),
  // `mobile` first so short keys resolve to mobile strings; shared web
  // concepts are addressed explicitly as `translation:<path>`.
  ns: ["mobile", "translation"],
  defaultNS: DEFAULT_NAMESPACE,
  fallbackNS: "translation",
  supportedLngs: LANGUAGE_ENTRIES.map(([, { tag }]) => tag),
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
  const tag = getLanguageTag(lng);
  if (i18n.language !== tag) {
    loadLanguage(lng);
    await i18n.changeLanguage(tag);
  }
}

/**
 * Add a language's strings (and its fallbacks') to i18next if they aren't
 * there yet. `setAppLanguage` does this; call it directly only to read
 * another language's strings, e.g. with `getFixedT`.
 */
export function loadLanguage(lng: SupportedLanguage): void {
  for (const lang of withFallbacks(lng)) {
    const tag = getLanguageTag(lang);
    if (!i18n.hasResourceBundle(tag, DEFAULT_NAMESPACE)) {
      const { mobile, translation } = LANGUAGES[lang].load();
      i18n.addResourceBundle(tag, "mobile", mobile);
      i18n.addResourceBundle(tag, "translation", translation);
    }
  }
}

/** date-fns locale matching the currently active app language. */
export function getDateFnsLocale(): Locale {
  return LANGUAGES[getActiveLanguage()].dateFns;
}

/**
 * BCP-47 locale tag for `Intl.*` APIs (`Intl.NumberFormat`,
 * `Intl.DateTimeFormat`), following the active app language.
 */
export function getIntlLocale(): string {
  return getLanguageTag(getActiveLanguage());
}
