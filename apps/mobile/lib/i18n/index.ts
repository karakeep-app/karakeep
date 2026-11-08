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
//   complete `mobile`-namespace translations for (all but `en_US`, since
//   the English source is already US English).
// - Some of those codes aren't valid BCP-47 (`zhtw`, `pt_BR`), so each
//   language also has a `tag` that i18next and `Intl` run on.

// Hermes has no Intl.PluralRules, which i18next needs to pick _one/_other keys.
// It must load before i18next initializes.
import "intl-pluralrules";

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
import arMobile from "./locales/ar.json";
import csMobile from "./locales/cs.json";
import daMobile from "./locales/da.json";
import deMobile from "./locales/de.json";
import elMobile from "./locales/el.json";
import esMobile from "./locales/es.json";
import fiMobile from "./locales/fi.json";
import frMobile from "./locales/fr.json";
import gaMobile from "./locales/ga.json";
import glMobile from "./locales/gl.json";
import hrMobile from "./locales/hr.json";
import huMobile from "./locales/hu.json";
import itMobile from "./locales/it.json";
import jaMobile from "./locales/ja.json";
import koMobile from "./locales/ko.json";
import nbNOMobile from "./locales/nb_NO.json";
import nlMobile from "./locales/nl.json";
import plMobile from "./locales/pl.json";
import ptMobile from "./locales/pt.json";
import ptBRMobile from "./locales/pt_BR.json";
import roMobile from "./locales/ro.json";
import ruMobile from "./locales/ru.json";
import skMobile from "./locales/sk.json";
import slMobile from "./locales/sl.json";
import svMobile from "./locales/sv.json";
import trMobile from "./locales/tr.json";
import ukMobile from "./locales/uk.json";
import viMobile from "./locales/vi.json";
import zhMobile from "./locales/zh.json";
import zhtwMobile from "./locales/zhtw.json";
import enWeb from "../../../web/lib/i18n/locales/en/translation.json";
import arWeb from "../../../web/lib/i18n/locales/ar/translation.json";
import csWeb from "../../../web/lib/i18n/locales/cs/translation.json";
import daWeb from "../../../web/lib/i18n/locales/da/translation.json";
import deWeb from "../../../web/lib/i18n/locales/de/translation.json";
import elWeb from "../../../web/lib/i18n/locales/el/translation.json";
import esWeb from "../../../web/lib/i18n/locales/es/translation.json";
import fiWeb from "../../../web/lib/i18n/locales/fi/translation.json";
import frWeb from "../../../web/lib/i18n/locales/fr/translation.json";
import gaWeb from "../../../web/lib/i18n/locales/ga/translation.json";
import glWeb from "../../../web/lib/i18n/locales/gl/translation.json";
import hrWeb from "../../../web/lib/i18n/locales/hr/translation.json";
import huWeb from "../../../web/lib/i18n/locales/hu/translation.json";
import itWeb from "../../../web/lib/i18n/locales/it/translation.json";
import jaWeb from "../../../web/lib/i18n/locales/ja/translation.json";
import koWeb from "../../../web/lib/i18n/locales/ko/translation.json";
import nbNOWeb from "../../../web/lib/i18n/locales/nb_NO/translation.json";
import nlWeb from "../../../web/lib/i18n/locales/nl/translation.json";
import plWeb from "../../../web/lib/i18n/locales/pl/translation.json";
import ptWeb from "../../../web/lib/i18n/locales/pt/translation.json";
import ptBRWeb from "../../../web/lib/i18n/locales/pt_BR/translation.json";
import roWeb from "../../../web/lib/i18n/locales/ro/translation.json";
import ruWeb from "../../../web/lib/i18n/locales/ru/translation.json";
import skWeb from "../../../web/lib/i18n/locales/sk/translation.json";
import slWeb from "../../../web/lib/i18n/locales/sl/translation.json";
import svWeb from "../../../web/lib/i18n/locales/sv/translation.json";
import trWeb from "../../../web/lib/i18n/locales/tr/translation.json";
import ukWeb from "../../../web/lib/i18n/locales/uk/translation.json";
import viWeb from "../../../web/lib/i18n/locales/vi/translation.json";
import zhWeb from "../../../web/lib/i18n/locales/zh/translation.json";
import zhtwWeb from "../../../web/lib/i18n/locales/zhtw/translation.json";

interface LanguageResources {
  /**
   * BCP-47 tag i18next and `Intl` run on. The `LANGUAGES` key is the code
   * the web app and the settings use, which isn't always valid BCP-47
   * (`zhtw`, `pt_BR`), and `Intl.PluralRules` throws on those.
   */
  tag: string;
  /** Other OS locale tags that should pick this language. */
  aliases?: readonly string[];
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
  en: { tag: "en", mobile: enMobile, translation: enWeb, dateFns: enUS },
  ar: {
    tag: "ar",
    mobile: arMobile,
    translation: arWeb,
    dateFns: arDateFns,
  },
  cs: {
    tag: "cs",
    mobile: csMobile,
    translation: csWeb,
    dateFns: csDateFns,
  },
  da: {
    tag: "da",
    mobile: daMobile,
    translation: daWeb,
    dateFns: daDateFns,
  },
  de: {
    tag: "de",
    mobile: deMobile,
    translation: deWeb,
    dateFns: deDateFns,
  },
  el: {
    tag: "el",
    mobile: elMobile,
    translation: elWeb,
    dateFns: elDateFns,
  },
  es: {
    tag: "es",
    mobile: esMobile,
    translation: esWeb,
    dateFns: esDateFns,
  },
  fi: {
    tag: "fi",
    mobile: fiMobile,
    translation: fiWeb,
    dateFns: fiDateFns,
  },
  fr: {
    tag: "fr",
    mobile: frMobile,
    translation: frWeb,
    dateFns: frDateFns,
  },
  ga: {
    tag: "ga",
    mobile: gaMobile,
    translation: gaWeb,
    // date-fns has no Irish locale; Irish users read English dates.
    dateFns: enGB,
  },
  gl: {
    tag: "gl",
    mobile: glMobile,
    translation: glWeb,
    dateFns: glDateFns,
  },
  hr: {
    tag: "hr",
    mobile: hrMobile,
    translation: hrWeb,
    dateFns: hrDateFns,
  },
  hu: {
    tag: "hu",
    mobile: huMobile,
    translation: huWeb,
    dateFns: huDateFns,
  },
  it: {
    tag: "it",
    mobile: itMobile,
    translation: itWeb,
    dateFns: itDateFns,
  },
  ja: {
    tag: "ja",
    mobile: jaMobile,
    translation: jaWeb,
    dateFns: jaDateFns,
  },
  ko: {
    tag: "ko",
    mobile: koMobile,
    translation: koWeb,
    dateFns: koDateFns,
  },
  nb_NO: {
    tag: "nb-NO",
    aliases: ["nb", "no", "nn"],
    mobile: nbNOMobile,
    translation: nbNOWeb,
    dateFns: nbDateFns,
  },
  nl: {
    tag: "nl",
    mobile: nlMobile,
    translation: nlWeb,
    dateFns: nlDateFns,
  },
  pl: {
    tag: "pl",
    mobile: plMobile,
    translation: plWeb,
    dateFns: plDateFns,
  },
  pt: {
    tag: "pt",
    mobile: ptMobile,
    translation: ptWeb,
    dateFns: ptDateFns,
  },
  pt_BR: {
    tag: "pt-BR",
    mobile: ptBRMobile,
    translation: ptBRWeb,
    dateFns: ptBRDateFns,
  },
  ro: {
    tag: "ro",
    mobile: roMobile,
    translation: roWeb,
    dateFns: roDateFns,
  },
  ru: {
    tag: "ru",
    mobile: ruMobile,
    translation: ruWeb,
    dateFns: ruDateFns,
  },
  sk: {
    tag: "sk",
    mobile: skMobile,
    translation: skWeb,
    dateFns: skDateFns,
  },
  sl: {
    tag: "sl",
    mobile: slMobile,
    translation: slWeb,
    dateFns: slDateFns,
  },
  sv: {
    tag: "sv",
    mobile: svMobile,
    translation: svWeb,
    dateFns: svDateFns,
  },
  tr: {
    tag: "tr",
    mobile: trMobile,
    translation: trWeb,
    dateFns: trDateFns,
  },
  uk: {
    tag: "uk",
    mobile: ukMobile,
    translation: ukWeb,
    dateFns: ukDateFns,
  },
  vi: {
    tag: "vi",
    mobile: viMobile,
    translation: viWeb,
    dateFns: viDateFns,
  },
  zh: {
    tag: "zh-Hans",
    mobile: zhMobile,
    translation: zhWeb,
    dateFns: zhCNDateFns,
  },
  zhtw: {
    tag: "zh-Hant",
    aliases: ["zh-TW", "zh-HK", "zh-MO"],
    mobile: zhtwMobile,
    translation: zhtwWeb,
    dateFns: zhTWDateFns,
  },
} satisfies Record<string, LanguageResources>;

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

// i18next runs on the BCP-47 tags, so its plural rules, `i18n.language`
// and its region fallback (pt-BR → pt → en) all work.
const resources = Object.fromEntries(
  LANGUAGE_ENTRIES.map(([, { tag, mobile, translation }]) => [
    tag,
    { mobile, translation },
  ]),
);

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return Object.hasOwn(LANGUAGES, lang);
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

void i18n.use(initReactI18next).init({
  resources,
  lng: getLanguageTag(getSystemLanguage()),
  fallbackLng: FALLBACK_LANGUAGE,
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
    await i18n.changeLanguage(tag);
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
