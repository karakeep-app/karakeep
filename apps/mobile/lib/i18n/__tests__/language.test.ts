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
