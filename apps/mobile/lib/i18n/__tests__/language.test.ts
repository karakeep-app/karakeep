import { formatDistanceToNow } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";

// expo-localization is a native module; mock the device locales per-test.
const mockGetLocales = vi.fn((): { languageTag: string }[] => [
  { languageTag: "en-US" },
]);

vi.mock("expo-localization", () => ({
  get getLocales() {
    return mockGetLocales;
  },
}));

import {
  FALLBACK_LANGUAGE,
  getDateFnsLocale,
  getIntlLocale,
  getLanguageTag,
  getSystemLanguage,
  i18n,
  loadLanguage,
  matchSupportedLanguage,
  resolveAppLanguage,
  setAppLanguage,
  SUPPORTED_LANGUAGES,
} from "../index";
import type { SupportedLanguage } from "../index";

// Read before any test loads more languages.
const LOADED_AT_STARTUP = SUPPORTED_LANGUAGES.filter((lang) =>
  i18n.hasResourceBundle(getLanguageTag(lang), "mobile"),
);

// Every shipped language except English, the source and fallback language.
const TRANSLATIONS = SUPPORTED_LANGUAGES.filter(
  (lang) => lang !== FALLBACK_LANGUAGE,
);

// date-fns has no locale for these; they format dates in English.
const ENGLISH_DATES = new Set(["ga"]);

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(obj: object, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

function mobileStrings(lang: SupportedLanguage) {
  loadLanguage(lang);
  return flatten(i18n.getResourceBundle(getLanguageTag(lang), "mobile"));
}

/**
 * Splits keys into plain keys and plural bases (`foo` for `foo_one`,
 * `foo_other`, ...) mapped to the plural categories they define.
 */
function splitPlurals(keys: string[]) {
  const plain = new Set<string>();
  const plurals = new Map<string, Set<string>>();
  for (const key of keys) {
    const match = PLURAL_SUFFIX.exec(key);
    const base = match ? key.slice(0, match.index) : undefined;
    if (match && base !== undefined && keys.includes(`${base}_other`)) {
      const categories = plurals.get(base) ?? new Set<string>();
      categories.add(match[1]);
      plurals.set(base, categories);
    } else {
      plain.add(key);
    }
  }
  return { plain, plurals };
}

afterEach(async () => {
  await i18n.changeLanguage(FALLBACK_LANGUAGE);
  mockGetLocales.mockReturnValue([{ languageTag: "en-US" }]);
});

describe("matchSupportedLanguage", () => {
  it.each(SUPPORTED_LANGUAGES)(
    "matches %s with or without a region",
    (lang) => {
      expect(matchSupportedLanguage([{ languageTag: lang }])).toBe(lang);
      expect(matchSupportedLanguage([{ languageTag: `${lang}-ZZ` }])).toBe(
        lang,
      );
      expect(matchSupportedLanguage([{ languageTag: `${lang}_ZZ` }])).toBe(
        lang,
      );
    },
  );

  it("picks the first supported locale in the OS preference list", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(
        matchSupportedLanguage([
          { languageTag: "zz-ZZ" },
          { languageTag: lang },
        ]),
      ).toBe(lang);
    }
  });

  it.each([
    ["zh-Hans-CN", "zh"],
    ["zh-CN", "zh"],
    ["zh-SG", "zh"],
    ["zh-Hans-HK", "zh"],
    ["zh-Hant-TW", "zhtw"],
    ["zh-TW", "zhtw"],
    ["zh-HK", "zhtw"],
    ["zh-Hant", "zhtw"],
    ["pt-BR", "pt_BR"],
    ["pt-PT", "pt"],
    ["nb-NO", "nb_NO"],
    ["nb", "nb_NO"],
    ["no", "nb_NO"],
    ["nn-NO", "nb_NO"],
    ["en-GB", "en"],
    ["de-AT", "de"],
    ["sr-Latn-RS", "en"],
  ])("matches the OS locale %s to %s", (tag, lang) => {
    expect(matchSupportedLanguage([{ languageTag: tag }])).toBe(lang);
  });

  it("falls back to English for unsupported locales", () => {
    expect(FALLBACK_LANGUAGE).toBe("en");
    expect(matchSupportedLanguage([{ languageTag: "zz-ZZ" }])).toBe("en");
    expect(matchSupportedLanguage([])).toBe("en");
  });
});

describe("resolveAppLanguage", () => {
  it.each(SUPPORTED_LANGUAGES)("follows a %s system language", (lang) => {
    expect(resolveAppLanguage(undefined, lang)).toBe(lang);
    expect(resolveAppLanguage("system", lang)).toBe(lang);
  });

  it.each(SUPPORTED_LANGUAGES)("honours an explicit %s override", (lang) => {
    for (const system of SUPPORTED_LANGUAGES) {
      expect(resolveAppLanguage(lang, system)).toBe(lang);
    }
  });

  it("falls back to English for unknown overrides", () => {
    for (const system of SUPPORTED_LANGUAGES) {
      expect(resolveAppLanguage("zz", system)).toBe("en");
    }
  });
});

describe("getSystemLanguage", () => {
  it.each(SUPPORTED_LANGUAGES)("reads a %s OS locale", (lang) => {
    mockGetLocales.mockReturnValue([{ languageTag: `${lang}-ZZ` }]);
    expect(getSystemLanguage()).toBe(lang);
  });
});

describe("loading", () => {
  it("starts with only English and the system language", () => {
    expect(LOADED_AT_STARTUP).toEqual(["en"]);
  });

  it("loads a language with its fallbacks", async () => {
    await setAppLanguage("pt_BR");
    expect(i18n.hasResourceBundle("pt-BR", "mobile")).toBe(true);
    expect(i18n.hasResourceBundle("pt-PT", "translation")).toBe(true);
    expect(i18n.languages).toEqual(["pt-BR", "pt-PT", "en"]);
  });
});

describe("English source strings", () => {
  const strings = mobileStrings(FALLBACK_LANGUAGE);

  it("has no empty strings", () => {
    const empty = Object.entries(strings)
      .filter(([, value]) => typeof value !== "string" || value.length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
    expect(Object.keys(strings).length).toBeGreaterThan(400);
  });

  it("uses English plural forms", () => {
    const t = i18n.getFixedT(FALLBACK_LANGUAGE, "mobile");
    expect(t("tags_tab.bookmarks", { count: 1 })).toBe("1 bookmark");
    expect(t("tags_tab.bookmarks", { count: 5 })).toBe("5 bookmarks");
  });
});

describe.each(SUPPORTED_LANGUAGES)("%s plural forms", (lang) => {
  it("define exactly the categories the language uses", () => {
    const { plurals } = splitPlurals(Object.keys(mobileStrings(lang)));
    const expected = new Intl.PluralRules(getLanguageTag(lang))
      .resolvedOptions()
      .pluralCategories.toSorted();
    expect(plurals.size).toBeGreaterThan(0);
    for (const [base, categories] of plurals) {
      expect([...categories].toSorted(), base).toEqual(expected);
    }
  });
});

describe.each(TRANSLATIONS)("%s translation", (lang) => {
  const strings = mobileStrings(lang);

  it("has no empty strings", () => {
    const empty = Object.entries(strings)
      .filter(([, value]) => typeof value !== "string" || value.length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("is applied at runtime and switches back", async () => {
    const expected = strings["settings.theme"];
    await setAppLanguage(lang);
    expect(i18n.getFixedT(null, "mobile")("settings.theme")).toBe(expected);
    await setAppLanguage(FALLBACK_LANGUAGE);
    expect(i18n.getFixedT(null, "mobile")("settings.theme")).toBe("Theme");
  });

  it("uses its own plural forms at runtime", async () => {
    await setAppLanguage(lang);
    const t = i18n.getFixedT(null, "mobile");
    const rules = new Intl.PluralRules(getLanguageTag(lang));
    for (const count of [0, 1, 2, 3, 5, 11, 21, 100]) {
      expect(t("tags_tab.bookmarks", { count }), String(count)).toBe(
        String(strings[`tags_tab.bookmarks_${rules.select(count)}`]).replace(
          "{{count}}",
          String(count),
        ),
      );
    }
  });

  it("loads the web app's shared strings", () => {
    loadLanguage(lang);
    const tag = getLanguageTag(lang);
    const web = i18n.getResourceBundle(tag, "translation");
    expect(i18n.getFixedT(tag, "translation")("actions.save")).toBe(
      web.actions.save,
    );
  });

  it("returns the key for unknown keys instead of crashing", () => {
    loadLanguage(lang);
    const t = i18n.getFixedT(getLanguageTag(lang), "mobile");
    expect(t("does.not.exist" as never)).toBe("does.not.exist");
  });

  it("formats dates and numbers in the language", async () => {
    await setAppLanguage(lang);
    const tag = getLanguageTag(lang);
    expect(getIntlLocale()).toBe(tag);
    // ICU may drop the region (nb-NO → nb), but must not fall back.
    expect(
      new Intl.NumberFormat(getIntlLocale())
        .resolvedOptions()
        .locale.split("-")[0],
    ).toBe(tag.split("-")[0]);
    if (ENGLISH_DATES.has(lang)) {
      expect(getDateFnsLocale().code.split("-")[0]).toBe("en");
      return;
    }
    expect(getDateFnsLocale().code.split("-")[0]).toBe(tag.split("-")[0]);
    expect(
      formatDistanceToNow(Date.now() - 3 * 3600 * 1000, {
        addSuffix: true,
        locale: getDateFnsLocale(),
      }),
    ).not.toMatch(/ago/);
  });
});

describe("English date and number helpers", () => {
  it("use the English locales", () => {
    expect(getIntlLocale()).toBe("en");
    expect(getDateFnsLocale().code).toBe("en-US");
  });
});
