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
  getSystemLanguage,
  i18n,
  matchSupportedLanguage,
  resolveAppLanguage,
  SUPPORTED_LANGUAGES,
} from "../index";

// Every shipped language except English, the source and fallback language.
const TRANSLATIONS = SUPPORTED_LANGUAGES.filter(
  (lang) => lang !== FALLBACK_LANGUAGE,
);

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

function mobileStrings(lang: string) {
  return flatten(i18n.getResourceBundle(lang, "mobile"));
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
    const expected = new Intl.PluralRules(lang)
      .resolvedOptions()
      .pluralCategories.toSorted();
    expect(plurals.size).toBeGreaterThan(0);
    for (const [base, categories] of plurals) {
      expect([...categories].toSorted(), base).toEqual(expected);
    }
  });
});

describe.each(TRANSLATIONS)("%s translation", (lang) => {
  const source = splitPlurals(Object.keys(mobileStrings(FALLBACK_LANGUAGE)));
  const strings = mobileStrings(lang);
  const translated = splitPlurals(Object.keys(strings));

  it("has the same keys as English", () => {
    const missing = [...source.plain, ...source.plurals.keys()].filter(
      (key) => !translated.plain.has(key) && !translated.plurals.has(key),
    );
    const extra = [...translated.plain, ...translated.plurals.keys()].filter(
      (key) => !source.plain.has(key) && !source.plurals.has(key),
    );
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("has no empty strings", () => {
    const empty = Object.entries(strings)
      .filter(([, value]) => typeof value !== "string" || value.length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("is applied at runtime and switches back", async () => {
    const expected = strings["settings.theme"];
    await i18n.changeLanguage(lang);
    expect(i18n.getFixedT(null, "mobile")("settings.theme")).toBe(expected);
    await i18n.changeLanguage(FALLBACK_LANGUAGE);
    expect(i18n.getFixedT(null, "mobile")("settings.theme")).toBe("Theme");
  });

  it("loads the web app's shared strings", () => {
    const web = i18n.getResourceBundle(lang, "translation");
    expect(i18n.getFixedT(lang, "translation")("actions.save")).toBe(
      web.actions.save,
    );
  });

  it("returns the key for unknown keys instead of crashing", () => {
    const t = i18n.getFixedT(lang, "mobile");
    expect(t("does.not.exist" as never)).toBe("does.not.exist");
  });

  it("formats dates and numbers in the language", async () => {
    await i18n.changeLanguage(lang);
    expect(getIntlLocale()).toBe(lang);
    expect(getDateFnsLocale().code.split("-")[0]).toBe(lang);
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
