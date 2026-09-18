import { beforeAll, describe, expect, it, vi } from "vitest";

// expo-localization is a native module; mock the device locales per-test.
const mockGetLocales = vi.fn((): { languageTag: string }[] => [
  { languageTag: "en-US" },
]);

vi.mock("expo-localization", () => ({
  get getLocales() {
    return mockGetLocales;
  },
}));

import enMobile from "../locales/en.json";
import plMobile from "../locales/pl.json";
import {
  FALLBACK_LANGUAGE,
  getDateFnsLocale,
  getIntlLocale,
  getSystemLanguage,
  matchSupportedLanguage,
  resolveAppLanguage,
  SUPPORTED_LANGUAGES,
} from "../index";
import { i18n } from "../index";

function flatKeys(obj: unknown, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flatKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

describe("matchSupportedLanguage", () => {
  it.each([
    [[{ languageTag: "pl-PL" }], "pl"],
    [[{ languageTag: "pl" }], "pl"],
    [[{ languageTag: "en-US" }], "en"],
    [[{ languageTag: "en-GB" }], "en"],
    [[{ languageTag: "en_US" }], "en"],
    // first supported locale in the OS preference list wins
    [[{ languageTag: "de-DE" }, { languageTag: "pl" }], "pl"],
    [[{ languageTag: "fr-FR" }, { languageTag: "en-GB" }], "en"],
  ])("matches %j to %s", (locales, expected) => {
    expect(matchSupportedLanguage(locales)).toBe(expected);
  });

  it("falls back to English for unsupported locales", () => {
    expect(matchSupportedLanguage([{ languageTag: "de-DE" }])).toBe("en");
    expect(matchSupportedLanguage([{ languageTag: "uk-UA" }])).toBe("en");
    expect(matchSupportedLanguage([{ languageTag: "ja-JP" }])).toBe("en");
    expect(matchSupportedLanguage([])).toBe("en");
  });

  it("exposes English as the fallback language", () => {
    expect(FALLBACK_LANGUAGE).toBe("en");
    expect(SUPPORTED_LANGUAGES).toContain("en");
    expect(SUPPORTED_LANGUAGES).toContain("pl");
  });
});

describe("resolveAppLanguage", () => {
  it("follows the system language when unset or 'system'", () => {
    expect(resolveAppLanguage(undefined, "pl")).toBe("pl");
    expect(resolveAppLanguage("system", "pl")).toBe("pl");
    expect(resolveAppLanguage("system", "en")).toBe("en");
  });

  it("honours an explicit override", () => {
    expect(resolveAppLanguage("pl", "en")).toBe("pl");
    expect(resolveAppLanguage("en", "pl")).toBe("en");
  });

  it("falls back to English for unknown overrides", () => {
    expect(resolveAppLanguage("de", "pl")).toBe("en");
  });

  it("supports the system → pl → en → system cycle", () => {
    const system = "pl" as const;
    // system
    expect(resolveAppLanguage("system", system)).toBe("pl");
    // user picks Polish explicitly
    expect(resolveAppLanguage("pl", system)).toBe("pl");
    // user picks English explicitly
    expect(resolveAppLanguage("en", system)).toBe("en");
    // back to system
    expect(resolveAppLanguage("system", system)).toBe("pl");
  });
});

describe("getSystemLanguage", () => {
  it("reads the OS preferred locales", () => {
    mockGetLocales.mockReturnValue([{ languageTag: "pl-PL" }]);
    expect(getSystemLanguage()).toBe("pl");
    mockGetLocales.mockReturnValue([{ languageTag: "en-US" }]);
    expect(getSystemLanguage()).toBe("en");
  });
});

describe("mobile locale parity (en ↔ pl)", () => {
  it("has identical keys in both languages", () => {
    const enKeys = new Set(flatKeys(enMobile));
    const plKeys = new Set(flatKeys(plMobile));
    const missing = [...enKeys].filter((k) => !plKeys.has(k));
    const extra = [...plKeys].filter((k) => !enKeys.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(enKeys.size).toBeGreaterThan(400);
  });

  it("has no empty translations", () => {
    const check = (obj: unknown, path = "") => {
      for (const [key, value] of Object.entries(
        obj as Record<string, unknown>,
      )) {
        const p = path ? `${path}.${key}` : key;
        if (value !== null && typeof value === "object") {
          check(value, p);
        } else {
          expect(typeof value === "string" && value.length > 0, p).toBe(true);
        }
      }
    };
    check(enMobile);
    check(plMobile);
  });
});

describe("runtime translations", () => {
  beforeAll(async () => {
    if (i18n.language !== "en") {
      await i18n.changeLanguage("en");
    }
  });

  it("resolves mobile-namespace Polish strings with interpolation", async () => {
    await i18n.changeLanguage("pl");
    const t = i18n.getFixedT("pl", "mobile");
    expect(t("settings.theme")).toBe("Motyw");
    expect(t("settings.language_system", { language: "polski" })).toBe(
      "Systemowy (polski)",
    );
    expect(t("manage_tags.create_tag", { name: "Praca" })).toBe(
      "Utwórz „Praca”",
    );
    expect(t("tags.deleted", { name: "Praca" })).toBe("Usunięto tag „Praca”");
  });

  it("resolves shared web-namespace translations identically", async () => {
    await i18n.changeLanguage("pl");
    const t = i18n.getFixedT("pl", "translation");
    expect(t("actions.save")).toBe("Zapisz");
    expect(t("common.something_went_wrong")).toBe("Coś poszło nie tak");
    expect(t("actions.sort.newest_first")).toBe("Najnowsze pierwsze");
  });

  it("falls back to English for missing keys", () => {
    const t = i18n.getFixedT("pl", "mobile");
    // Deliberately unknown key: i18next returns the key itself when even
    // the fallback language lacks it -- must never crash the UI.
    expect(t("does.not.exist" as never)).toBe("does.not.exist");
  });

  it("switches languages at runtime and back", async () => {
    await i18n.changeLanguage("pl");
    expect(i18n.getFixedT(null, "mobile")("settings.theme")).toBe("Motyw");
    await i18n.changeLanguage("en");
    expect(i18n.getFixedT(null, "mobile")("settings.theme")).toBe("Theme");
    await i18n.changeLanguage("pl");
    expect(i18n.language).toBe("pl");
  });
});

describe("Polish pluralization", () => {
  // The app relies on Intl.PluralRules for locale-aware counts; pin the
  // notoriously irregular Polish categories so regressions surface here.
  it.each([
    [1, "one"],
    [2, "few"],
    [4, "few"],
    [5, "many"],
    [12, "many"],
    [14, "many"],
    [22, "few"],
    [25, "many"],
    [112, "many"],
    [122, "few"],
  ])("pl: %i → %s", (n, expected) => {
    expect(new Intl.PluralRules("pl").select(n)).toBe(expected);
  });
});

describe("UI plural forms", () => {
  // i18next picks `key_<category>` from Intl.PluralRules for the language.
  it.each([
    ["pl", 1, "zakładka"],
    ["pl", 2, "zakładki"],
    ["pl", 4, "zakładki"],
    ["pl", 5, "zakładek"],
    ["pl", 22, "zakładki"],
    ["pl", 25, "zakładek"],
    ["en", 1, "bookmark"],
    ["en", 2, "bookmarks"],
    ["en", 5, "bookmarks"],
  ])("tags_tab.bookmarks in %s for %i → %s", async (lang, count, expected) => {
    await i18n.changeLanguage(lang);
    const t = i18n.getFixedT(lang, "mobile");
    expect(t("tags_tab.bookmarks", { count })).toBe(expected);
  });

  it("uses one/few/many for Polish storage item counts", () => {
    const t = i18n.getFixedT("pl", "mobile");
    expect(t("stats.item", { count: 1 })).toBe("element");
    expect(t("stats.item", { count: 3 })).toBe("elementy");
    expect(t("stats.item", { count: 8 })).toBe("elementów");
  });

  it("uses one/few/many for emoji result counts", () => {
    const tPl = i18n.getFixedT("pl", "mobile");
    expect(tPl("emoji.results", { count: 1 })).toBe("1 wynik");
    expect(tPl("emoji.results", { count: 3 })).toBe("3 wyniki");
    expect(tPl("emoji.results", { count: 12 })).toBe("12 wyników");

    const tEn = i18n.getFixedT("en", "mobile");
    expect(tEn("emoji.results", { count: 1 })).toBe("1 result");
    expect(tEn("emoji.results", { count: 4 })).toBe("4 results");
  });

  it("defines a translation for every plural category a language can produce", () => {
    const locales: Record<string, unknown> = { en: enMobile, pl: plMobile };
    const bases = ["tags_tab.bookmarks", "stats.item", "emoji.results"];

    for (const [lang, locale] of Object.entries(locales)) {
      // Sample integers and decimals so irregular categories (pl "few"
      // for 22, "other" for fractions) are all required to exist.
      const samples = [...Array.from({ length: 201 }, (_, i) => i), 1.5, 2.5];
      const rules = new Intl.PluralRules(lang);
      const categories = [...new Set(samples.map((n) => rules.select(n)))];

      for (const base of bases) {
        for (const category of categories) {
          const value = getByPath(locale, `${base}_${category}`);
          expect(
            typeof value === "string" && value.length > 0,
            `${lang} is missing ${base}_${category}`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("locale-aware date and number helpers", () => {
  it("follows the active app language", async () => {
    await i18n.changeLanguage("pl");
    expect(getIntlLocale()).toBe("pl");
    await i18n.changeLanguage("en");
    expect(getIntlLocale()).toBe("en");
  });

  it("formats dates in the app language, not the device locale", async () => {
    const format = () =>
      new Intl.DateTimeFormat(getIntlLocale(), {
        day: "numeric",
        month: "long",
      }).format(new Date(2024, 0, 15));

    // Polish uses the genitive month form with a day ("15 stycznia");
    // English the other way round ("January 15").
    await i18n.changeLanguage("pl");
    expect(format()).toBe("15 stycznia");

    await i18n.changeLanguage("en");
    expect(format()).toBe("January 15");
  });

  it("exposes a date-fns locale matching the app language", async () => {
    await i18n.changeLanguage("pl");
    expect(getDateFnsLocale().code).toBe("pl");
    await i18n.changeLanguage("en");
    expect(getDateFnsLocale().code).toBe("en-US");
  });

  it("formats relative dates in Polish for pl", async () => {
    await i18n.changeLanguage("pl");
    const { formatDistanceToNow } = await import("date-fns");
    const text = formatDistanceToNow(new Date(Date.now() - 3 * 3600 * 1000), {
      addSuffix: true,
      locale: getDateFnsLocale(),
    });
    expect(text).toMatch(/temu/);
  });
});
