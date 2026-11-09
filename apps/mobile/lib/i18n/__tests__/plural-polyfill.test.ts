import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en-US" }],
}));

// Hermes ships no `Intl.PluralRules`. Remove Node's before loading the i18n
// module, so it has to bring its own, as it does on a device.
const NativePluralRules = Intl.PluralRules;
delete (Intl as { PluralRules?: unknown }).PluralRules;

const { getLanguageTag, i18n, setAppLanguage, SUPPORTED_LANGUAGES } =
  await import("../index");

afterAll(() => {
  Object.assign(Intl, { PluralRules: NativePluralRules });
});

describe("without a native Intl.PluralRules", () => {
  it("polyfills it", () => {
    expect(Intl.PluralRules).not.toBe(NativePluralRules);
    expect(Intl.PluralRules).toBeDefined();
  });

  it.each(SUPPORTED_LANGUAGES)("agrees with CLDR for %s", (lang) => {
    const tag = getLanguageTag(lang);
    const polyfilled = new Intl.PluralRules(tag);
    const native = new NativePluralRules(tag);
    for (const count of [
      0, 1, 2, 3, 5, 11, 21, 100, 101, 1001, 1003, 1011, 2003, 10001, 100003,
      1000000,
    ]) {
      expect(polyfilled.select(count), String(count)).toBe(
        native.select(count),
      );
    }
  });

  it.each(SUPPORTED_LANGUAGES)("picks %s plural forms", async (lang) => {
    await setAppLanguage(lang);
    const tag = getLanguageTag(lang);
    const strings = i18n.getResourceBundle(tag, "mobile").tags_tab;
    // The polyfill must agree with the native CLDR rules for every tag.
    const native = new NativePluralRules(tag);
    const t = i18n.getFixedT(null, "mobile");
    for (const count of [0, 1, 2, 3, 5, 11, 21, 100, 1003, 1000000]) {
      expect(t("tags_tab.bookmarks", { count }), String(count)).toBe(
        String(strings[`bookmarks_${native.select(count)}`]).replace(
          "{{count}}",
          String(count),
        ),
      );
    }
  });
});
